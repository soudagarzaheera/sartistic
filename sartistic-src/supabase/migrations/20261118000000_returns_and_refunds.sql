-- Returns and refunds.
--
-- * orders.delivered_at is the moment Shiprocket reports the shipment as
--   delivered. It is written once by server code (tracking sync / webhook) and
--   never overwritten, so duplicate or retried delivery events are harmless.
--   The 3-day return/refund window is calculated from it (src/lib/returns.ts).
-- * return_requests / refund_requests hold one request per order item.
--   Customers can READ their own requests but cannot write them: every insert
--   and status change goes through server functions (service role) that check
--   ownership, the delivery window and allowed status transitions on the
--   server's clock, so the deadline can't be bypassed from the browser.
-- * Internal admin remarks are excluded from the columns customers may read.
-- * Supporting photos go to the private "return-evidence" bucket, in a folder
--   named after the customer's user id. Admins view them via signed URLs.

-- ============ delivery timestamp ============
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE OR REPLACE FUNCTION public.protect_order_delivery_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW; -- service_role / database owner (server code, SQL editor)
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.delivered_at IS NOT NULL THEN
      RAISE EXCEPTION 'Delivery date can only be set by the server' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN
    RAISE EXCEPTION 'Delivery date can only be set by the server' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.protect_order_delivery_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_protect_delivery_fields ON public.orders;
CREATE TRIGGER orders_protect_delivery_fields BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_order_delivery_fields();

-- Backfill from tracking already stored: Shiprocket's delivered_date is an IST
-- wall-clock string such as "2026-11-16 14:23:18". Only for orders the
-- tracking sync already marked delivered.
UPDATE public.orders o
SET delivered_at = (substring(d.v FROM '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?')::timestamp
                    AT TIME ZONE 'Asia/Kolkata')
FROM (
  SELECT id, shiprocket_tracking -> 'shipment_track' -> 0 ->> 'delivered_date' AS v
  FROM public.orders
  WHERE delivered_at IS NULL AND status = 'delivered' AND shiprocket_tracking IS NOT NULL
) d
WHERE o.id = d.id
  AND d.v ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}';

-- ============ return requests ============
CREATE TABLE IF NOT EXISTS public.return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity int NOT NULL CHECK (quantity > 0),
  reason text NOT NULL,
  details text,
  image_paths text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'picked_up', 'returned')),
  -- Snapshot of the window this request was accepted in.
  delivered_at timestamptz NOT NULL,
  window_ends_at timestamptz NOT NULL,
  customer_message text,          -- shown to the customer (e.g. rejection reason)
  admin_remarks text,             -- internal only
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  picked_up_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One return request per order item (prevents duplicates, including races).
  CONSTRAINT return_requests_item_unique UNIQUE (order_item_id)
);
CREATE INDEX IF NOT EXISTS return_requests_order_idx ON public.return_requests(order_id);
CREATE INDEX IF NOT EXISTS return_requests_user_idx ON public.return_requests(user_id);
CREATE INDEX IF NOT EXISTS return_requests_status_idx ON public.return_requests(status, created_at DESC);

DROP TRIGGER IF EXISTS return_requests_updated ON public.return_requests;
CREATE TRIGGER return_requests_updated BEFORE UPDATE ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.return_requests FROM anon, authenticated;
GRANT ALL ON public.return_requests TO service_role;
-- Everything except admin_remarks / reviewed_by.
GRANT SELECT (id, order_id, order_item_id, user_id, quantity, reason, details, image_paths, status,
              delivered_at, window_ends_at, customer_message, reviewed_at, picked_up_at,
              returned_at, created_at, updated_at)
  ON public.return_requests TO authenticated;
DROP POLICY IF EXISTS "read own return requests" ON public.return_requests;
CREATE POLICY "read own return requests" ON public.return_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============ refund requests ============
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  quantity int NOT NULL CHECK (quantity > 0),
  reason text NOT NULL,
  details text,
  image_paths text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'under_review', 'approved', 'processing', 'refunded', 'rejected')),
  -- Original payment transaction (snapshot from the order).
  payment_method text NOT NULL CHECK (payment_method IN ('razorpay', 'cod')),
  razorpay_payment_id text,
  requested_amount numeric(10,2) NOT NULL CHECK (requested_amount >= 0),
  approved_amount numeric(10,2) CHECK (approved_amount > 0),
  -- Gateway refund (Razorpay rfnd_...) or, for COD, the bank/UPI reference the admin paid with.
  gateway_refund_id text,
  gateway_status text,
  refund_reference text,
  failure_reason text,
  delivered_at timestamptz NOT NULL,
  window_ends_at timestamptz NOT NULL,
  customer_message text,
  admin_remarks text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  processing_started_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_requests_item_unique UNIQUE (order_item_id),
  -- "Refunded" always carries proof: a gateway refund id or a manual reference.
  CONSTRAINT refund_requests_refunded_has_reference CHECK (
    status <> 'refunded' OR (approved_amount IS NOT NULL AND refunded_at IS NOT NULL
      AND (gateway_refund_id IS NOT NULL OR refund_reference IS NOT NULL))
  )
);
CREATE INDEX IF NOT EXISTS refund_requests_order_idx ON public.refund_requests(order_id);
CREATE INDEX IF NOT EXISTS refund_requests_user_idx ON public.refund_requests(user_id);
CREATE INDEX IF NOT EXISTS refund_requests_status_idx ON public.refund_requests(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_gateway_refund_idx
  ON public.refund_requests(gateway_refund_id) WHERE gateway_refund_id IS NOT NULL;

DROP TRIGGER IF EXISTS refund_requests_updated ON public.refund_requests;
CREATE TRIGGER refund_requests_updated BEFORE UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.refund_requests FROM anon, authenticated;
GRANT ALL ON public.refund_requests TO service_role;
GRANT SELECT (id, order_id, order_item_id, user_id, return_request_id, quantity, reason, details,
              image_paths, status, payment_method, requested_amount, approved_amount,
              delivered_at, window_ends_at, customer_message, reviewed_at, refunded_at,
              created_at, updated_at)
  ON public.refund_requests TO authenticated;
DROP POLICY IF EXISTS "read own refund requests" ON public.refund_requests;
CREATE POLICY "read own refund requests" ON public.refund_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============ evidence photos ============
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('return-evidence', 'return-evidence', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','image/avif','image/gif'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "customers upload own return evidence" ON storage.objects;
DROP POLICY IF EXISTS "read own or admin return evidence" ON storage.objects;
-- Customers may add files to their own folder only; no update or delete, so
-- evidence attached to a request can't be swapped afterwards.
CREATE POLICY "customers upload own return evidence" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'return-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "read own or admin return evidence" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'return-evidence'
         AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));

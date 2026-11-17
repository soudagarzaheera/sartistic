-- Shiprocket: courier (AWB) assignment, pickup scheduling and an event log.
--
-- Until now the integration only created the Shiprocket order
-- (/orders/create/adhoc). Shiprocket leaves such orders in status NEW with no
-- courier, AWB or pickup, so the parcel never moves and there is nothing to
-- track. These fields record the two missing steps:
--
-- * awb_assigned_at / pickup_scheduled_at / pickup_token: what Shiprocket
--   confirmed. *_requested_at are short-lived claims that stop two admins (or
--   a double click) assigning two AWBs or booking two pickups at once.
-- * shiprocket_status_at: time of the newest Shiprocket event stored, so an
--   older update can never overwrite a newer status.
--
-- All are written only by server code (service role).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS awb_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS awb_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_token text,
  ADD COLUMN IF NOT EXISTS pickup_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS shiprocket_status_at timestamptz;

CREATE OR REPLACE FUNCTION public.protect_order_shiprocket_ops_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW; -- service_role / database owner (server code, SQL editor)
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.awb_assigned_at IS NOT NULL OR NEW.awb_requested_at IS NOT NULL
       OR NEW.pickup_scheduled_at IS NOT NULL OR NEW.pickup_token IS NOT NULL
       OR NEW.pickup_requested_at IS NOT NULL OR NEW.shiprocket_status_at IS NOT NULL THEN
      RAISE EXCEPTION 'Shipment fields can only be set by the server' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.awb_assigned_at IS DISTINCT FROM OLD.awb_assigned_at
     OR NEW.awb_requested_at IS DISTINCT FROM OLD.awb_requested_at
     OR NEW.pickup_scheduled_at IS DISTINCT FROM OLD.pickup_scheduled_at
     OR NEW.pickup_token IS DISTINCT FROM OLD.pickup_token
     OR NEW.pickup_requested_at IS DISTINCT FROM OLD.pickup_requested_at
     OR NEW.shiprocket_status_at IS DISTINCT FROM OLD.shiprocket_status_at THEN
    RAISE EXCEPTION 'Shipment fields can only be changed by the server' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.protect_order_shiprocket_ops_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_protect_shiprocket_ops_fields ON public.orders;
CREATE TRIGGER orders_protect_shiprocket_ops_fields BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_order_shiprocket_ops_fields();

-- ============ Shiprocket log ============
-- Every webhook delivery (for debugging and duplicate detection) and every
-- admin/automatic Shiprocket action with its outcome, including the exact API
-- error. Admin-only: error text can include account details (wallet, KYC).
CREATE TABLE IF NOT EXISTS public.shiprocket_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('webhook', 'sync', 'awb', 'pickup', 'shipment', 'cron')),
  outcome text NOT NULL CHECK (outcome IN ('ok', 'error', 'duplicate', 'ignored')),
  message text,
  shiprocket_status text,
  event_at timestamptz,
  -- Webhook deliveries only: identical events share a key and are processed once.
  dedupe_key text UNIQUE,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shiprocket_logs_order_idx ON public.shiprocket_logs(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shiprocket_logs_created_idx ON public.shiprocket_logs(created_at DESC);

ALTER TABLE public.shiprocket_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shiprocket_logs FROM anon, authenticated;
GRANT SELECT ON public.shiprocket_logs TO authenticated;
GRANT ALL ON public.shiprocket_logs TO service_role;
DROP POLICY IF EXISTS "admins read shiprocket logs" ON public.shiprocket_logs;
CREATE POLICY "admins read shiprocket logs" ON public.shiprocket_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

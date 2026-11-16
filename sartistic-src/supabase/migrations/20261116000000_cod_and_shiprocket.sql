-- Cash on Delivery + Shiprocket shipment tracking.
--
-- * payment_method distinguishes prepaid (Razorpay) from COD orders. Existing
--   orders are all Razorpay, which is what the default backfills.
-- * checkout_key makes COD order creation idempotent per customer.
-- * payment_collected_* records who marked a COD payment as received, and when.
-- * shiprocket_* stores the shipment references; shipment_requested_at is a
--   claim used to stop two concurrent requests creating duplicate shipments.
--
-- All new fields are server-only: COD orders are created with the service role
-- after server-side price calculation, so customers can never insert a COD
-- order (with made-up totals) straight through the API.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'razorpay',
  ADD COLUMN IF NOT EXISTS checkout_key uuid,
  ADD COLUMN IF NOT EXISTS payment_collected_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_collected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shiprocket_order_id text,
  ADD COLUMN IF NOT EXISTS shiprocket_shipment_id text,
  ADD COLUMN IF NOT EXISTS shiprocket_awb text,
  ADD COLUMN IF NOT EXISTS shipment_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS shipment_created_at timestamptz;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('razorpay', 'cod'));

CREATE UNIQUE INDEX IF NOT EXISTS orders_user_checkout_key_idx
  ON public.orders(user_id, checkout_key) WHERE checkout_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_shiprocket_order_idx
  ON public.orders(shiprocket_order_id) WHERE shiprocket_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_payment_method_idx ON public.orders(payment_method);

-- Same rules as before, plus the new server-only fields.
CREATE OR REPLACE FUNCTION public.protect_order_payment_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW; -- service_role / database owner (server code, SQL editor)
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_status <> 'pending' OR NEW.status <> 'pending'
       OR NEW.razorpay_order_id IS NOT NULL OR NEW.razorpay_payment_id IS NOT NULL THEN
      RAISE EXCEPTION 'New orders must start as pending and unpaid' USING ERRCODE = '42501';
    END IF;
    IF NEW.payment_method <> 'razorpay'
       OR NEW.payment_collected_at IS NOT NULL OR NEW.payment_collected_by IS NOT NULL
       OR NEW.shiprocket_order_id IS NOT NULL OR NEW.shiprocket_shipment_id IS NOT NULL
       OR NEW.shiprocket_awb IS NOT NULL OR NEW.shipment_requested_at IS NOT NULL
       OR NEW.shipment_created_at IS NOT NULL THEN
      RAISE EXCEPTION 'These order fields can only be set by the server' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.razorpay_order_id IS DISTINCT FROM OLD.razorpay_order_id
     OR NEW.razorpay_payment_id IS DISTINCT FROM OLD.razorpay_payment_id
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.discount IS DISTINCT FROM OLD.discount
     OR NEW.shipping_fee IS DISTINCT FROM OLD.shipping_fee
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.order_number IS DISTINCT FROM OLD.order_number
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.checkout_key IS DISTINCT FROM OLD.checkout_key
     OR NEW.payment_collected_at IS DISTINCT FROM OLD.payment_collected_at
     OR NEW.payment_collected_by IS DISTINCT FROM OLD.payment_collected_by
     OR NEW.shiprocket_order_id IS DISTINCT FROM OLD.shiprocket_order_id
     OR NEW.shiprocket_shipment_id IS DISTINCT FROM OLD.shiprocket_shipment_id
     OR NEW.shiprocket_awb IS DISTINCT FROM OLD.shiprocket_awb
     OR NEW.shipment_requested_at IS DISTINCT FROM OLD.shipment_requested_at
     OR NEW.shipment_created_at IS DISTINCT FROM OLD.shipment_created_at THEN
    RAISE EXCEPTION 'Payment details can only be changed by verified payment processing'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.protect_order_payment_fields() FROM PUBLIC, anon, authenticated;

-- Customers may only add items to their own order while it is a fresh,
-- unpaid Razorpay order (the window in which checkout writes them). Before
-- this, items could be appended to any of their orders, including paid ones.
-- COD order items are written by the server with the service role.
DROP POLICY IF EXISTS "insert own order items" ON public.order_items;
CREATE POLICY "insert own order items" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id
      AND o.user_id = auth.uid()
      AND o.payment_method = 'razorpay'
      AND o.status = 'pending'
      AND o.payment_status = 'pending'
  ));

-- Shipment tracking from Shiprocket.
--
-- shiprocket_tracking keeps Shiprocket's original `tracking_data` object
-- exactly as returned (statuses, scan activities, ETD, track URL), so nothing
-- is lost or re-interpreted at storage time. The other columns are a small
-- denormalised summary for lists and filters.
--
-- Written only by server code (service role) after a Shiprocket API call or a
-- verified Shiprocket webhook; customers and admins can't forge tracking.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shiprocket_status text,
  ADD COLUMN IF NOT EXISTS shiprocket_status_code integer,
  ADD COLUMN IF NOT EXISTS shiprocket_courier text,
  ADD COLUMN IF NOT EXISTS shiprocket_etd text,
  ADD COLUMN IF NOT EXISTS shiprocket_track_url text,
  ADD COLUMN IF NOT EXISTS shiprocket_tracking jsonb,
  ADD COLUMN IF NOT EXISTS tracking_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_shiprocket_awb_idx
  ON public.orders(shiprocket_awb) WHERE shiprocket_awb IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_order_tracking_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW; -- service_role / database owner (server code, SQL editor)
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.shiprocket_status IS NOT NULL OR NEW.shiprocket_status_code IS NOT NULL
       OR NEW.shiprocket_courier IS NOT NULL OR NEW.shiprocket_etd IS NOT NULL
       OR NEW.shiprocket_track_url IS NOT NULL OR NEW.shiprocket_tracking IS NOT NULL
       OR NEW.tracking_synced_at IS NOT NULL THEN
      RAISE EXCEPTION 'Tracking fields can only be set by the server' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.shiprocket_status IS DISTINCT FROM OLD.shiprocket_status
     OR NEW.shiprocket_status_code IS DISTINCT FROM OLD.shiprocket_status_code
     OR NEW.shiprocket_courier IS DISTINCT FROM OLD.shiprocket_courier
     OR NEW.shiprocket_etd IS DISTINCT FROM OLD.shiprocket_etd
     OR NEW.shiprocket_track_url IS DISTINCT FROM OLD.shiprocket_track_url
     OR NEW.shiprocket_tracking IS DISTINCT FROM OLD.shiprocket_tracking
     OR NEW.tracking_synced_at IS DISTINCT FROM OLD.tracking_synced_at THEN
    RAISE EXCEPTION 'Tracking fields can only be changed by the server' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.protect_order_tracking_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_protect_tracking_fields ON public.orders;
CREATE TRIGGER orders_protect_tracking_fields BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_order_tracking_fields();

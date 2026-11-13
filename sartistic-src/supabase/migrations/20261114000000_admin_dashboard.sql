-- =====================================================================
-- Admin dashboard: collections, homepage content, order status history,
-- payment-field protection and image storage buckets.
--
-- Reuses the existing role system (public.user_roles + public.has_role()).
-- Safe to re-run: every object is created idempotently.
-- =====================================================================

-- ============ collections ============
CREATE TABLE IF NOT EXISTS public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collections_active_sort_idx ON public.collections(is_active, sort_order);
GRANT SELECT ON public.collections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT ALL ON public.collections TO service_role;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon read active collections" ON public.collections;
CREATE POLICY "anon read active collections" ON public.collections FOR SELECT TO anon USING (is_active);
DROP POLICY IF EXISTS "auth read collections" ON public.collections;
CREATE POLICY "auth read collections" ON public.collections FOR SELECT TO authenticated
  USING (is_active OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admins manage collections" ON public.collections;
CREATE POLICY "admins manage collections" ON public.collections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS collections_updated ON public.collections;
CREATE TRIGGER collections_updated BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.collection_products (
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, product_id)
);
CREATE INDEX IF NOT EXISTS collection_products_product_idx ON public.collection_products(product_id);
GRANT SELECT ON public.collection_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_products TO authenticated;
GRANT ALL ON public.collection_products TO service_role;
ALTER TABLE public.collection_products ENABLE ROW LEVEL SECURITY;
-- Membership rows only hold ids; the products/collections policies still hide
-- anything inactive when the rows are joined.
DROP POLICY IF EXISTS "public read collection products" ON public.collection_products;
CREATE POLICY "public read collection products" ON public.collection_products FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admins manage collection products" ON public.collection_products;
CREATE POLICY "admins manage collection products" ON public.collection_products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed collections from the existing categories so /collections keeps showing
-- the same groupings until the owner curates them.
INSERT INTO public.collections (name, slug, description, image_url, is_active, is_featured, sort_order)
SELECT c.name, c.slug, c.description, c.image_url, c.is_active, true, c.sort_order
FROM public.categories c
WHERE NOT EXISTS (SELECT 1 FROM public.collections)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.collection_products (collection_id, product_id)
SELECT col.id, p.id
FROM public.products p
JOIN public.categories c ON c.id = p.category_id
JOIN public.collections col ON col.slug = c.slug
ON CONFLICT DO NOTHING;

-- ============ homepage content ============
CREATE TABLE IF NOT EXISTS public.homepage_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]+$'),
  label text NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.homepage_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homepage_sections TO authenticated;
GRANT ALL ON public.homepage_sections TO service_role;
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read homepage" ON public.homepage_sections;
CREATE POLICY "public read homepage" ON public.homepage_sections FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admins manage homepage" ON public.homepage_sections;
CREATE POLICY "admins manage homepage" ON public.homepage_sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS homepage_sections_updated ON public.homepage_sections;
CREATE TRIGGER homepage_sections_updated BEFORE UPDATE ON public.homepage_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seeded with the content currently hard-coded on the homepage, so the site
-- looks identical until the owner edits it.
INSERT INTO public.homepage_sections (key, label, sort_order, is_visible, content) VALUES
 ('hero', 'Hero banner', 10, true, jsonb_build_object(
    'eyebrow', 'Premium Mehndi · Est. Artistry',
    'heading', E'Tradition,\nCrafted Beautifully.',
    'subtitle', 'Discover SARTISTIC Mehndi — thoughtfully presented for moments of beauty, celebration and artistic expression.',
    'image_url', '/images/image1.jpg',
    'image_alt', 'Hands adorned with intricate Mehndi patterns resting on ivory silk',
    'primary_label', 'Shop Mehndi', 'primary_link', '/shop',
    'secondary_label', 'Explore Our Story', 'secondary_link', '/about')),
 ('promo', 'Promotional banner', 15, false, jsonb_build_object(
    'text', 'Introductory offer — 5% off every cone pack.', 'link_label', 'Shop now', 'link', '/shop')),
 ('trust', 'Trust strip', 20, true, jsonb_build_object(
    'items', jsonb_build_array('Premium Quality', 'Authentic Mehndi', 'Beautiful Application', 'Carefully Presented', 'Secure Checkout'))),
 ('featured_products', 'Featured products', 30, true, jsonb_build_object(
    'eyebrow', 'The Collection', 'title', 'Shop SARTISTIC', 'subtitle', 'Discover our Mehndi collection.', 'limit', 8)),
 ('collections', 'Featured collections', 40, true, jsonb_build_object(
    'eyebrow', 'Curated', 'title', 'Shop by Collection', 'subtitle', 'From everyday cones to bridal presentation sets.')),
 ('story', 'Brand story', 50, true, jsonb_build_object(
    'eyebrow', 'Our Story', 'title', E'More Than Mehndi.\nIt''s an Art Form.',
    'body', E'SARTISTIC celebrates the beauty of Mehndi as an artistic tradition — the patience of the hand, the rhythm of the line, the quiet ceremony of waiting for colour to appear.\n\nWe take that tradition and give it a modern, premium brand experience: considered presentation, clear information and products made for artists and for celebration.',
    'image_url', '/images/image2.jpg', 'image_alt', 'Henna leaves, paste and a carved Indian printing block')),
 ('why', 'Why SARTISTIC', 60, true, jsonb_build_object(
    'eyebrow', 'Why SARTISTIC', 'title', 'Six reasons the ritual feels different.')),
 ('gallery', 'Gallery preview', 70, true, jsonb_build_object(
    'eyebrow', 'Mehndi Art', 'title', 'A Gallery of Designs', 'subtitle', 'Bridal, Arabic, Traditional, Minimal, Festive and Contemporary.')),
 ('how_to_use', 'How to use', 80, true, jsonb_build_object('eyebrow', 'The Ritual', 'title', 'How to Use')),
 ('reviews', 'Customer reviews', 90, true, jsonb_build_object('eyebrow', 'Reviews', 'title', 'From Our Customers')),
 ('social', 'Instagram strip', 100, true, jsonb_build_object('eyebrow', '@sartistic', 'title', 'Follow the artistry')),
 ('faq', 'FAQ', 110, true, jsonb_build_object('eyebrow', 'Questions', 'title', 'Frequently Asked')),
 ('cta', 'Closing call to action', 120, true, jsonb_build_object(
    'eyebrow', 'SARTISTIC', 'title', 'Tradition, Crafted Beautifully.',
    'subtitle', 'Where timeless Mehndi artistry meets modern elegance.', 'button_label', 'Shop Mehndi', 'button_link', '/shop'))
ON CONFLICT (key) DO NOTHING;

-- ============ orders: payment fields are server-only ============
-- Payment state may only change through trusted server code (Razorpay
-- signature verification and the webhook, both using the service role).
-- Admins and customers going through the API can never mark an order paid,
-- change Razorpay references or alter amounts — even with a crafted request.
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
     OR NEW.order_number IS DISTINCT FROM OLD.order_number THEN
    RAISE EXCEPTION 'Payment details can only be changed by verified payment processing'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.protect_order_payment_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_protect_payment_fields ON public.orders;
CREATE TRIGGER orders_protect_payment_fields BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_order_payment_fields();

-- ============ order status history ============
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('status', 'payment_status')),
  old_value text,
  new_value text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('admin', 'system')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_status_history_order_idx ON public.order_status_history(order_id, created_at);
GRANT SELECT ON public.order_status_history TO authenticated;
GRANT ALL ON public.order_status_history TO service_role;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own or admin order history" ON public.order_status_history;
CREATE POLICY "read own or admin order history" ON public.order_status_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
                 AND (o.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- Written by trigger only (SECURITY DEFINER), so nobody can forge history rows.
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _source text := CASE WHEN auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN 'admin' ELSE 'system' END;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history (order_id, field, old_value, new_value, changed_by, source)
    VALUES (NEW.id, 'status', OLD.status, NEW.status, auth.uid(), _source);
  END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    INSERT INTO public.order_status_history (order_id, field, old_value, new_value, changed_by, source)
    VALUES (NEW.id, 'payment_status', OLD.payment_status, NEW.payment_status, auth.uid(), _source);
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.log_order_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_log_status ON public.orders;
CREATE TRIGGER orders_log_status AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();

CREATE INDEX IF NOT EXISTS orders_created_idx ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON public.orders(payment_status);

-- ============ storage ============
-- Public buckets: images are served by URL independently of GitHub/Vercel.
-- Only admins can upload, replace or delete (policies below).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-images',    'product-images',    true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/avif','image/gif']),
  ('gallery-images',    'gallery-images',    true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/avif','image/gif']),
  ('homepage-banners',  'homepage-banners',  true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/avif','image/gif']),
  ('collection-images', 'collection-images', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/avif','image/gif'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "admins write product and gallery files" ON storage.objects;
DROP POLICY IF EXISTS "public read product and gallery files" ON storage.objects;
DROP POLICY IF EXISTS "admins manage store images" ON storage.objects;
DROP POLICY IF EXISTS "admins list store images" ON storage.objects;

-- Files are fetched through public URLs (no policy needed); listing the
-- bucket contents is admin-only.
CREATE POLICY "admins list store images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('product-images','gallery-images','homepage-banners','collection-images')
         AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage store images" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id IN ('product-images','gallery-images','homepage-banners','collection-images')
         AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id IN ('product-images','gallery-images','homepage-banners','collection-images')
              AND public.has_role(auth.uid(), 'admin'));

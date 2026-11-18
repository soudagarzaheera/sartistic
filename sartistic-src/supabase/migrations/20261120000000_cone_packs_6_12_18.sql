-- Switch the cone packs from 4 / 8 / 12 to 6 / 12 / 18.
-- Prices: 225 / 447 / 670, shown against a crossed-out MRP of 242 / 481 / 720
-- (compare_at_price), which works out to a 7% discount on each pack.
-- Packs of 4 and 8 are hidden, not deleted, so order history stays intact
-- (order_items keep their own name/price snapshot either way).

-- 1. Create / refresh the three cone packs.
INSERT INTO public.products (category_id, name, slug, short_description, description, sku, price, compare_at_price, stock_quantity, ingredients, how_to_use, storage_instructions, shipping_information, return_information, is_featured, is_active)
SELECT c.id, v.name, v.slug, v.short_description, v.description, v.sku, v.price, v.compare_at_price, v.stock,
  'Henna leaf powder, essential oil blend, sugar, water. Refer to the pack for the exact list supplied with your batch.',
  'Snip the tip, apply steady pressure and draw your design. Use one cone at a time and keep the rest sealed.',
  'Store in a cool, dry place away from direct sunlight. Refrigerate unopened cones for longer freshness.',
  'Dispatched within 2 business days. Delivery timelines vary by location.',
  'Unopened items may be returned within 7 days of delivery.',
  true, true
FROM (VALUES
  ('Mehndi Cones — Pack of 6',  'mehndi-cones-pack-of-6',  'Six signature cones, finely filtered for fluid detail.',        'A pack of six SARTISTIC Mehndi cones — ideal for personal use and small occasions.',          'SAR-CONE-6',  225.00, 242.00, 100),
  ('Mehndi Cones — Pack of 12', 'mehndi-cones-pack-of-12', 'Twelve signature cones for family celebrations.',              'A pack of twelve SARTISTIC Mehndi cones — great for festivals and family gatherings.',        'SAR-CONE-12', 447.00, 481.00, 100),
  ('Mehndi Cones — Pack of 18', 'mehndi-cones-pack-of-18', 'Eighteen signature cones for artists and busy seasons.',        'A pack of eighteen SARTISTIC Mehndi cones — made for artists, weddings and large gatherings.', 'SAR-CONE-18', 670.00, 720.00, 100)
) AS v(name, slug, short_description, description, sku, price, compare_at_price, stock)
CROSS JOIN (SELECT id FROM public.categories WHERE slug = 'premium-mehndi-cones') c
ON CONFLICT (slug) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  description = EXCLUDED.description,
  sku = EXCLUDED.sku,
  price = EXCLUDED.price,
  compare_at_price = EXCLUDED.compare_at_price,
  is_featured = true,
  is_active = true;

-- 2. Hide every other product from the storefront (incl. packs of 4 and 8).
UPDATE public.products
SET is_active = false, is_featured = false
WHERE slug NOT IN ('mehndi-cones-pack-of-6', 'mehndi-cones-pack-of-12', 'mehndi-cones-pack-of-18');

-- 3. Reset the packs' images.
DELETE FROM public.product_images
WHERE product_id IN (SELECT id FROM public.products WHERE slug IN ('mehndi-cones-pack-of-6', 'mehndi-cones-pack-of-12', 'mehndi-cones-pack-of-18'));

INSERT INTO public.product_images (product_id, image_url, alt_text, is_primary, sort_order)
SELECT p.id, v.image_url, p.name, true, 0
FROM (VALUES
  ('mehndi-cones-pack-of-6',  '/images/products/image7.jpg'),
  ('mehndi-cones-pack-of-12', '/images/products/image5.jpg'),
  ('mehndi-cones-pack-of-18', '/images/products/image6.jpg')
) AS v(slug, image_url)
JOIN public.products p ON p.slug = v.slug;

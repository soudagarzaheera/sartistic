-- Keep only three quantity-based products: packs of 4, 8 and 12 Mehndi cones.
-- Uses image5–7 only; image3, image4 and image8 are removed from the site.
-- Pricing: MRP 149 / 299 / 499 (compare_at_price) with ~5% discount (price), rounded to whole rupees: 142 / 284 / 474.

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
  ('Mehndi Cones — Pack of 4',  'mehndi-cones-pack-of-4',  'Four signature cones, finely filtered for fluid detail.',      'A pack of four SARTISTIC Mehndi cones — ideal for personal use and small occasions.',       'SAR-CONE-4',  142.00, 149.00, 100),
  ('Mehndi Cones — Pack of 8',  'mehndi-cones-pack-of-8',  'Eight signature cones for family celebrations.',               'A pack of eight SARTISTIC Mehndi cones — great for festivals and family gatherings.',         'SAR-CONE-8',  284.00, 299.00, 100),
  ('Mehndi Cones — Pack of 12', 'mehndi-cones-pack-of-12', 'Twelve signature cones for artists and busy seasons.',         'A pack of twelve SARTISTIC Mehndi cones — made for artists, weddings and large gatherings.', 'SAR-CONE-12', 474.00, 499.00, 100)
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

-- 2. Hide every other product from the storefront (kept for order history).
UPDATE public.products
SET is_active = false, is_featured = false
WHERE slug NOT IN ('mehndi-cones-pack-of-4', 'mehndi-cones-pack-of-8', 'mehndi-cones-pack-of-12');

-- 3. Remove image rows pointing at deleted files and reset the packs' images.
DELETE FROM public.product_images
WHERE image_url IN ('/images/products/image3.jpg', '/images/products/image4.jpg', '/images/products/image8.jpg')
   OR product_id IN (SELECT id FROM public.products WHERE slug IN ('mehndi-cones-pack-of-4', 'mehndi-cones-pack-of-8', 'mehndi-cones-pack-of-12'));

INSERT INTO public.product_images (product_id, image_url, alt_text, is_primary, sort_order)
SELECT p.id, v.image_url, p.name, true, 0
FROM (VALUES
  ('mehndi-cones-pack-of-4',  '/images/products/image7.jpg'),
  ('mehndi-cones-pack-of-8',  '/images/products/image5.jpg'),
  ('mehndi-cones-pack-of-12', '/images/products/image6.jpg')
) AS v(slug, image_url)
JOIN public.products p ON p.slug = v.slug;

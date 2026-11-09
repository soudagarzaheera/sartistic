-- Add three more designs to the gallery (image12 … image14).
INSERT INTO public.gallery_images (category_id, image_url, title, sort_order)
SELECT c.id, v.image_url, v.title, v.sort_order
FROM (VALUES
  ('bridal',       '/images/gallery/image12.jpg', 'Bridal Design',       4),
  ('contemporary', '/images/gallery/image13.jpg', 'Contemporary Design', 5),
  ('festive',      '/images/gallery/image14.jpg', 'Festive Design',      6)
) AS v(slug, image_url, title, sort_order)
JOIN public.gallery_categories c ON c.slug = v.slug
WHERE NOT EXISTS (SELECT 1 FROM public.gallery_images g WHERE g.image_url = v.image_url);

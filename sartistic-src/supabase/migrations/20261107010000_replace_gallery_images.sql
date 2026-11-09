-- Replace the gallery with the three new designs (image9 … image11).
DELETE FROM public.gallery_images
WHERE image_url NOT IN ('/images/gallery/image9.jpg', '/images/gallery/image10.jpg', '/images/gallery/image11.jpg');

UPDATE public.gallery_images g
SET title = v.title,
    category_id = (SELECT id FROM public.gallery_categories WHERE slug = v.slug),
    sort_order = v.sort_order
FROM (VALUES
  ('/images/gallery/image9.jpg',  'Minimal Design',     'minimal',     1),
  ('/images/gallery/image10.jpg', 'Arabic Design',      'arabic',      2),
  ('/images/gallery/image11.jpg', 'Traditional Design', 'traditional', 3),
  ('/images/gallery/image12.jpg', 'Bridal Design', 'Bridal',       4),
  ('/images/gallery/image13.jpg', 'Contemporary Design', 'contemporary' , 5),
  ('/images/gallery/image14.jpg', 'Festive Design', 'festive',     6)
) AS v(image_url, title, slug, sort_order)
WHERE g.image_url = v.image_url;

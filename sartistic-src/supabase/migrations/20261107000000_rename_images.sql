-- Point product and gallery images at the renamed files (image3.jpg … image14.jpg).
UPDATE public.product_images SET image_url = CASE image_url
  WHEN '/images/products/sartistic-premium-mehndi-cone.jpg'   THEN '/images/products/image3.jpg'
  WHEN '/images/products/fine-tip-detailing-cone.jpg'         THEN '/images/products/image4.jpg'
  WHEN '/images/products/bridal-mehndi-presentation-set.jpg'  THEN '/images/products/image5.jpg'
  WHEN '/images/products/artist-bundle-12-cones.jpg'          THEN '/images/products/image6.jpg'
  WHEN '/images/products/mehndi-design-starter-kit.jpg'       THEN '/images/products/image7.jpg'
  WHEN '/images/products/aftercare-sealing-balm.jpg'          THEN '/images/products/image8.jpg'
  ELSE image_url END
WHERE image_url LIKE '/images/products/%';

UPDATE public.gallery_images SET image_url = CASE image_url
  WHEN '/images/gallery/bridal-1.jpg'       THEN '/images/gallery/image9.jpg'
  WHEN '/images/gallery/arabic-1.jpg'       THEN '/images/gallery/image10.jpg'
  WHEN '/images/gallery/traditional-1.jpg'  THEN '/images/gallery/image11.jpg'
  WHEN '/images/gallery/minimal-1.jpg'      THEN '/images/gallery/image12.jpg'
  WHEN '/images/gallery/festive-1.jpg'      THEN '/images/gallery/image13.jpg'
  WHEN '/images/gallery/contemporary-1.jpg' THEN '/images/gallery/image14.jpg'
  ELSE image_url END
WHERE image_url LIKE '/images/gallery/%';

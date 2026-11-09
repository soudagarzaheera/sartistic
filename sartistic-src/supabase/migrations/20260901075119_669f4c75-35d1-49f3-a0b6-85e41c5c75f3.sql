
CREATE POLICY "public read product and gallery files" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('product-images','gallery-images'));
CREATE POLICY "admins write product and gallery files" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id IN ('product-images','gallery-images') AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id IN ('product-images','gallery-images') AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "users manage own uploads" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id IN ('review-images','avatars') AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id IN ('review-images','avatars') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "read review and avatar files" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('review-images','avatars'));

DELETE FROM public.gallery_images WHERE image_url LIKE '%-2.jpg';

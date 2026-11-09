
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

DROP POLICY "public read active categories" ON public.categories;
CREATE POLICY "anon read active categories" ON public.categories FOR SELECT TO anon USING (is_active);
CREATE POLICY "auth read categories" ON public.categories FOR SELECT TO authenticated USING (is_active OR public.has_role(auth.uid(),'admin'));

DROP POLICY "public read active products" ON public.products;
CREATE POLICY "anon read active products" ON public.products FOR SELECT TO anon USING (is_active);
CREATE POLICY "auth read products" ON public.products FOR SELECT TO authenticated USING (is_active OR public.has_role(auth.uid(),'admin'));

DROP POLICY "public read variants" ON public.product_variants;
CREATE POLICY "anon read variants" ON public.product_variants FOR SELECT TO anon USING (is_active);
CREATE POLICY "auth read variants" ON public.product_variants FOR SELECT TO authenticated USING (is_active OR public.has_role(auth.uid(),'admin'));

DROP POLICY "public read active gallery" ON public.gallery_images;
CREATE POLICY "anon read active gallery" ON public.gallery_images FOR SELECT TO anon USING (is_active);
CREATE POLICY "auth read gallery" ON public.gallery_images FOR SELECT TO authenticated USING (is_active OR public.has_role(auth.uid(),'admin'));

DROP POLICY "public read approved reviews" ON public.reviews;
CREATE POLICY "anon read approved reviews" ON public.reviews FOR SELECT TO anon USING (is_approved);
CREATE POLICY "auth read reviews" ON public.reviews FOR SELECT TO authenticated USING (is_approved OR user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

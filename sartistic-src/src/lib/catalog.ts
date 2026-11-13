import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProductImage = {
  id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
};

export type ProductVariant = {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  is_active: boolean;
  sku: string | null;
};

export type Product = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  sku: string | null;
  price: number;
  compare_at_price: number | null;
  stock_quantity: number;
  low_stock_threshold: number;
  ingredients: string | null;
  how_to_use: string | null;
  storage_instructions: string | null;
  shipping_information: string | null;
  return_information: string | null;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  product_images: ProductImage[];
  product_variants: ProductVariant[];
  categories?: { name: string; slug: string } | null;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
};

const PRODUCT_SELECT =
  "*, product_images(id, image_url, alt_text, sort_order, is_primary), product_variants(id, name, price, stock_quantity, is_active, sku), categories(name, slug)";

export function primaryImage(product: Pick<Product, "product_images" | "name">) {
  const images = [...(product.product_images ?? [])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
  );
  return images[0]?.image_url ?? "/images/products/placeholder.jpg";
}

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: async (): Promise<Category[]> => {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as Category[];
  },
});

export const featuredProductsQuery = queryOptions({
  queryKey: ["products", "featured"],
  queryFn: async (): Promise<Product[]> => {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("is_active", true)
      .eq("is_featured", true)
      .order("created_at")
      .limit(8);
    if (error) throw error;
    return (data ?? []) as unknown as Product[];
  },
});

export const allProductsQuery = queryOptions({
  queryKey: ["products", "all"],
  queryFn: async (): Promise<Product[]> => {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as Product[];
  },
});

export function productQuery(slug: string) {
  return queryOptions({
    queryKey: ["product", slug],
    queryFn: async (): Promise<Product | null> => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Product) ?? null;
    },
  });
}

export function productReviewsQuery(productId: string | undefined) {
  return queryOptions({
    queryKey: ["reviews", productId],
    enabled: Boolean(productId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id, rating, title, review, author_name, is_verified_purchase, created_at")
        .eq("product_id", productId!)
        .eq("is_approved", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export const productRatingsQuery = queryOptions({
  queryKey: ["reviews", "ratings"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("reviews")
      .select("product_id, rating")
      .eq("is_approved", true);
    if (error) throw error;
    const map = new Map<string, { total: number; count: number }>();
    for (const row of data ?? []) {
      const entry = map.get(row.product_id) ?? { total: 0, count: 0 };
      entry.total += row.rating;
      entry.count += 1;
      map.set(row.product_id, entry);
    }
    return Object.fromEntries(
      [...map.entries()].map(([id, v]) => [id, { average: v.total / v.count, count: v.count }]),
    ) as Record<string, { average: number; count: number }>;
  },
});

export const galleryCategoriesQuery = queryOptions({
  queryKey: ["gallery-categories"],
  queryFn: async () => {
    const { data, error } = await supabase.from("gallery_categories").select("*").order("name");
    if (error) throw error;
    return data ?? [];
  },
});

export const galleryImagesQuery = queryOptions({
  queryKey: ["gallery-images"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("gallery_images")
      .select("*, gallery_categories(name, slug)")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return data ?? [];
  },
});

export type Collection = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
};

/** Active collections in display order. */
export const collectionsQuery = queryOptions({
  queryKey: ["collections"],
  queryFn: async (): Promise<Collection[]> => {
    const { data, error } = await supabase
      .from("collections")
      .select("id, name, slug, description, image_url, is_active, is_featured, sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .order("name");
    // Before the admin migration runs the table doesn't exist — fall back quietly.
    if (error) return [];
    return data ?? [];
  },
});

/** A collection with its (active) products, in the order the admin set. */
export function collectionQuery(slug: string) {
  return queryOptions({
    queryKey: ["collection", slug],
    queryFn: async (): Promise<(Collection & { products: Product[] }) | null> => {
      const { data, error } = await supabase
        .from("collections")
        .select(
          `id, name, slug, description, image_url, is_active, is_featured, sort_order, collection_products(sort_order, products(${PRODUCT_SELECT}))`,
        )
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error || !data) return null;
      const rows = (data.collection_products ?? []) as unknown as {
        sort_order: number;
        products: Product | null;
      }[];
      const { collection_products: _ignored, ...collection } = data;
      return {
        ...collection,
        products: rows
          .filter((r) => r.products && r.products.is_active)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((r) => r.products as Product),
      };
    },
  });
}

export type HomepageSection = {
  key: string;
  label: string;
  is_visible: boolean;
  sort_order: number;
  content: Record<string, unknown>;
};

/** Editable homepage content, managed from /admin/homepage. */
export const homepageSectionsQuery = queryOptions({
  queryKey: ["homepage-sections"],
  queryFn: async (): Promise<HomepageSection[] | null> => {
    const { data, error } = await supabase
      .from("homepage_sections")
      .select("key, label, is_visible, sort_order, content")
      .order("sort_order");
    // null = table missing/unreachable → homepage falls back to built-in defaults.
    if (error) return null;
    return (data ?? []) as HomepageSection[];
  },
});

export const siteSettingsQuery = queryOptions({
  queryKey: ["site-settings"],
  queryFn: async () => {
    const { data, error } = await supabase.from("site_settings").select("key, value");
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<string, unknown>;
  },
});

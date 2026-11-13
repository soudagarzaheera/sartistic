import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Search, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { discountPercent, formatPrice } from "@/lib/format";
import { IMAGE_BUCKETS } from "@/lib/upload";
import { invalidateStorefront } from "@/lib/admin-cache";
import { cn } from "@/lib/utils";
import {
  ImageUploader,
  PageHeader,
  Panel,
  StatusPill,
  dbErrorMessage,
  selectClass,
  slugify,
  useConfirm,
} from "@/components/admin/ui";

export const Route = createFileRoute("/admin/products")({
  component: AdminProducts,
});

type Img = {
  id: string;
  image_url: string;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
};
type Variant = {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  sku: string | null;
  is_active: boolean;
};
type Row = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  price: number;
  compare_at_price: number | null;
  stock_quantity: number;
  low_stock_threshold: number;
  category_id: string | null;
  short_description: string | null;
  description: string | null;
  ingredients: string | null;
  how_to_use: string | null;
  storage_instructions: string | null;
  shipping_information: string | null;
  return_information: string | null;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  product_images: Img[];
  product_variants: Variant[];
  collection_products: { collection_id: string }[];
};

const TEXT_FIELDS = [
  ["description", "Full description"],
  ["ingredients", "Ingredients"],
  ["how_to_use", "How to use"],
  ["storage_instructions", "Storage instructions"],
  ["shipping_information", "Shipping information"],
  ["return_information", "Return information"],
] as const;

function sortImages(images: Img[]) {
  return [...images].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
  );
}

function AdminProducts() {
  const queryClient = useQueryClient();
  const [confirm, confirmDialog] = useConfirm();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [collection, setCollection] = useState("");
  const [status, setStatus] = useState("");

  const products = useQuery({
    queryKey: ["admin", "products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "*, product_images(id, image_url, alt_text, is_primary, sort_order), product_variants(*), collection_products(collection_id)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, is_active")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const collections = useQuery({
    queryKey: ["admin", "collections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("id, name, is_active")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
    invalidateStorefront(queryClient);
  };

  async function patch(p: Row, values: Partial<Pick<Row, "is_active" | "is_featured">>) {
    const { error } = await supabase.from("products").update(values).eq("id", p.id);
    if (error) toast.error(dbErrorMessage(error, "Couldn't update product"));
    else {
      toast.success(
        "is_active" in values
          ? values.is_active
            ? `${p.name} is now visible`
            : `${p.name} is now hidden`
          : values.is_featured
            ? `${p.name} featured`
            : `${p.name} unfeatured`,
      );
      refresh();
    }
  }

  async function remove(p: Row) {
    const ok = await confirm({
      title: `Delete “${p.name}”?`,
      description:
        "This permanently removes the product, its images list, variants, reviews and wishlist entries. Past orders keep their saved details. To take it off the store temporarily, hide it instead.",
      confirmLabel: "Delete product",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) toast.error(dbErrorMessage(error, "Couldn't delete — try hiding it instead."));
    else {
      toast.success("Product deleted");
      refresh();
    }
  }

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products.data ?? []).filter((p) => {
      if (q && !`${p.name} ${p.sku ?? ""} ${p.slug}`.toLowerCase().includes(q)) return false;
      if (category && (category === "none" ? p.category_id : p.category_id !== category))
        return false;
      if (collection && !p.collection_products.some((c) => c.collection_id === collection))
        return false;
      if (status === "active" && !p.is_active) return false;
      if (status === "hidden" && p.is_active) return false;
      if (status === "featured" && !p.is_featured) return false;
      if (status === "low" && p.stock_quantity > p.low_stock_threshold) return false;
      return true;
    });
  }, [products.data, search, category, collection, status]);

  if (editing) {
    return (
      <ProductForm
        product={editing === "new" ? null : editing}
        categories={categories.data ?? []}
        collections={collections.data ?? []}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    );
  }

  const categoryName = (id: string | null) =>
    categories.data?.find((c) => c.id === id)?.name ?? "—";

  return (
    <div>
      {confirmDialog}
      <PageHeader
        title="Products"
        description="Everything here is live on the store as soon as you save — no redeploy needed."
        actions={
          <Button className="rounded-none" onClick={() => setEditing("new")}>
            <Plus className="mr-1 size-4" /> New product
          </Button>
        }
      />

      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, SKU or slug"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-none pl-9"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={selectClass}
        >
          <option value="">All categories</option>
          <option value="none">No category</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={collection}
          onChange={(e) => setCollection(e.target.value)}
          className={selectClass}
        >
          <option value="">All collections</option>
          {collections.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
          <option value="">Any status</option>
          <option value="active">Visible</option>
          <option value="hidden">Hidden</option>
          <option value="featured">Featured</option>
          <option value="low">Low stock</option>
        </select>
      </div>

      <div className="mt-4 overflow-x-auto border border-border bg-background">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border text-left text-[0.68rem] tracking-[0.14em] text-muted-foreground uppercase">
            <tr>
              <th className="p-3 font-normal">Product</th>
              <th className="p-3 font-normal">Category</th>
              <th className="p-3 font-normal">Price</th>
              <th className="p-3 font-normal">Stock</th>
              <th className="p-3 font-normal">Visible</th>
              <th className="p-3 font-normal">Featured</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const img = sortImages(p.product_images)[0];
              const off = discountPercent(Number(p.price), Number(p.compare_at_price));
              const low = p.stock_quantity <= p.low_stock_threshold;
              return (
                <tr
                  key={p.id}
                  className="border-b border-border last:border-0 hover:bg-secondary/40"
                >
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="flex items-center gap-3 text-left"
                    >
                      {img ? (
                        <img src={img.image_url} alt="" className="size-12 shrink-0 object-cover" />
                      ) : (
                        <span className="size-12 shrink-0 bg-secondary" />
                      )}
                      <span>
                        <span className="block font-medium hover:underline">{p.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {p.sku ?? p.slug}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="p-3 text-muted-foreground">{categoryName(p.category_id)}</td>
                  <td className="p-3 whitespace-nowrap">
                    {formatPrice(p.price)}
                    {off && (
                      <span className="ml-2 text-xs text-muted-foreground line-through">
                        {formatPrice(p.compare_at_price)}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {low ? (
                      <StatusPill tone={p.stock_quantity === 0 ? "bad" : "warn"}>
                        {p.stock_quantity}
                      </StatusPill>
                    ) : (
                      p.stock_quantity
                    )}
                  </td>
                  <td className="p-3">
                    <Switch
                      checked={p.is_active}
                      onCheckedChange={(v) => void patch(p, { is_active: v })}
                      aria-label="Visible in store"
                    />
                  </td>
                  <td className="p-3">
                    <Switch
                      checked={p.is_featured}
                      onCheckedChange={(v) => void patch(p, { is_featured: v })}
                      aria-label="Featured"
                    />
                  </td>
                  <td className="space-x-3 p-3 text-right whitespace-nowrap">
                    <button className="underline underline-offset-4" onClick={() => setEditing(p)}>
                      Edit
                    </button>
                    <button
                      className="text-destructive underline underline-offset-4"
                      onClick={() => void remove(p)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {products.isLoading && (
          <p className="p-6 text-sm text-muted-foreground">Loading products…</p>
        )}
        {products.isError && (
          <p className="p-6 text-sm text-destructive">Couldn't load products.</p>
        )}
        {!products.isLoading && list.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">No products match these filters.</p>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {list.length} of {products.data?.length ?? 0} products
      </p>
    </div>
  );
}

function ProductForm({
  product,
  categories,
  collections,
  onClose,
  onSaved,
}: {
  product: Row | null;
  categories: { id: string; name: string }[];
  collections: { id: string; name: string; is_active: boolean }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(product));
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [compare, setCompare] = useState(
    product?.compare_at_price ? String(product.compare_at_price) : "",
  );
  const [featured, setFeatured] = useState(product?.is_featured ?? false);
  const [active, setActive] = useState(product?.is_active ?? true);
  const [images, setImages] = useState<Img[]>(sortImages(product?.product_images ?? []));
  const [variants, setVariants] = useState<Variant[]>(product?.product_variants ?? []);
  const [memberOf, setMemberOf] = useState<string[]>(
    product?.collection_products.map((c) => c.collection_id) ?? [],
  );

  const off = discountPercent(Number(price), Number(compare));

  function moveImage(i: number, dir: -1 | 1) {
    setImages((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }
  function makeMain(i: number) {
    setImages((prev) => [prev[i]!, ...prev.filter((_, j) => j !== i)]);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const priceNum = Number(price);
    const compareNum = compare.trim() ? Number(compare) : null;
    const finalSlug = slugify(slug || name);
    if (!name.trim()) return void toast.error("Product name is required");
    if (!finalSlug) return void toast.error("Enter a valid URL slug");
    if (!(priceNum > 0)) return void toast.error("Enter a price greater than zero");
    if (compareNum !== null && !(compareNum > priceNum)) {
      return void toast.error(
        "The original price must be higher than the selling price (or leave it empty)",
      );
    }
    for (const v of variants) {
      if (!v.name.trim() || !(Number(v.price) > 0)) {
        return void toast.error("Every variant needs a name and a price greater than zero");
      }
    }

    const payload = {
      name: name.trim(),
      slug: finalSlug,
      sku: String(f.get("sku") ?? "").trim() || null,
      price: priceNum,
      compare_at_price: compareNum,
      stock_quantity: Math.max(0, Math.floor(Number(f.get("stock_quantity")) || 0)),
      low_stock_threshold: Math.max(0, Math.floor(Number(f.get("low_stock_threshold")) || 0)),
      category_id: String(f.get("category_id") || "") || null,
      short_description: String(f.get("short_description") ?? "").trim() || null,
      is_featured: featured,
      is_active: active,
      ...Object.fromEntries(
        TEXT_FIELDS.map(([key]) => [key, String(f.get(key) ?? "").trim() || null]),
      ),
    };

    setBusy(true);
    try {
      const result = product
        ? await supabase.from("products").update(payload).eq("id", product.id).select("id").single()
        : await supabase.from("products").insert(payload).select("id").single();
      if (result.error || !result.data)
        throw new Error(dbErrorMessage(result.error, "Couldn't save product."));
      const id = result.data.id;

      // Images: replace the list in the chosen order (first = main image).
      const delImages = await supabase.from("product_images").delete().eq("product_id", id);
      if (delImages.error) throw new Error("Product saved, but its images couldn't be updated.");
      if (images.length) {
        const ins = await supabase.from("product_images").insert(
          images.map((img, i) => ({
            product_id: id,
            image_url: img.image_url,
            alt_text: img.alt_text || payload.name,
            sort_order: i,
            is_primary: i === 0,
          })),
        );
        if (ins.error) throw new Error("Product saved, but its images couldn't be updated.");
      }

      // Variants: update kept, insert new, delete removed.
      const keepIds = variants.filter((v) => !v.id.startsWith("new-")).map((v) => v.id);
      const removed = (product?.product_variants ?? [])
        .map((v) => v.id)
        .filter((v) => !keepIds.includes(v));
      if (removed.length) await supabase.from("product_variants").delete().in("id", removed);
      for (const v of variants) {
        const row = {
          product_id: id,
          name: v.name.trim(),
          price: Number(v.price),
          stock_quantity: Math.max(0, Math.floor(Number(v.stock_quantity) || 0)),
          sku: v.sku?.trim() || null,
          is_active: v.is_active,
        };
        const r = v.id.startsWith("new-")
          ? await supabase.from("product_variants").insert(row)
          : await supabase.from("product_variants").update(row).eq("id", v.id);
        if (r.error) throw new Error(dbErrorMessage(r.error, `Couldn't save variant “${v.name}”.`));
      }

      // Collections membership.
      const before = product?.collection_products.map((c) => c.collection_id) ?? [];
      const toRemove = before.filter((c) => !memberOf.includes(c));
      const toAdd = memberOf.filter((c) => !before.includes(c));
      if (toRemove.length) {
        await supabase
          .from("collection_products")
          .delete()
          .eq("product_id", id)
          .in("collection_id", toRemove);
      }
      if (toAdd.length) {
        const r = await supabase
          .from("collection_products")
          .insert(
            toAdd.map((collection_id) => ({ collection_id, product_id: id, sort_order: 999 })),
          );
        if (r.error) throw new Error("Product saved, but collections couldn't be updated.");
      }

      toast.success(
        product ? "Product updated — live on the store" : "Product created — live on the store",
      );
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save product");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All products
        </button>
        {product && (
          <a
            href={`/product/${product.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm underline underline-offset-4"
          >
            View on store
          </a>
        )}
      </div>
      <PageHeader title={product ? `Edit ${product.name}` : "New product"} />

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Panel title="Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slugTouched) setSlug(slugify(e.target.value));
                  }}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">URL slug</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugTouched(true);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  /product/{slugify(slug || name) || "…"}
                </p>
              </div>
              <F label="SKU" name="sku" value={product?.sku} />
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="short_description">Short description</Label>
                <Textarea
                  id="short_description"
                  name="short_description"
                  rows={2}
                  defaultValue={product?.short_description ?? ""}
                />
              </div>
            </div>
          </Panel>

          <Panel title="Images">
            <p className="mb-4 text-xs text-muted-foreground">
              The first image is the main image shown in listings. Use the arrows to reorder or the
              star to make an image main.
            </p>
            <div className="flex flex-wrap gap-3">
              {images.map((img, i) => (
                <div
                  key={img.id}
                  className={cn(
                    "group relative border",
                    i === 0 ? "border-accent" : "border-border",
                  )}
                >
                  <img src={img.image_url} alt="" className="size-28 object-cover" />
                  {i === 0 && (
                    <span className="absolute top-1 left-1 bg-accent px-1.5 text-[0.6rem] tracking-[0.12em] text-accent-foreground uppercase">
                      Main
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-background/90 p-1">
                    <button
                      type="button"
                      aria-label="Move left"
                      disabled={i === 0}
                      onClick={() => moveImage(i, -1)}
                      className="p-1 disabled:opacity-30"
                    >
                      <ArrowLeft className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Make main image"
                      disabled={i === 0}
                      onClick={() => makeMain(i)}
                      className="p-1 disabled:opacity-30"
                    >
                      <Star className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move right"
                      disabled={i === images.length - 1}
                      onClick={() => moveImage(i, 1)}
                      className="p-1 disabled:opacity-30"
                    >
                      <ArrowRight className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                      className="p-1 text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <ImageUploader
                compact
                bucket={IMAGE_BUCKETS.products}
                folder="products"
                label="Add images"
                onUploaded={(urls) =>
                  setImages((prev) => [
                    ...prev,
                    ...urls.map((url, k) => ({
                      id: crypto.randomUUID(),
                      image_url: url,
                      alt_text: null,
                      is_primary: false,
                      sort_order: prev.length + k,
                    })),
                  ])
                }
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              New images are previewed here and published when you save.
            </p>
          </Panel>

          <Panel
            title="Variants (sizes, colours, pack options)"
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-none"
                onClick={() =>
                  setVariants((v) => [
                    ...v,
                    {
                      id: `new-${crypto.randomUUID()}`,
                      name: "",
                      price: Number(price) || 0,
                      stock_quantity: 0,
                      sku: null,
                      is_active: true,
                    },
                  ])
                }
              >
                <Plus className="mr-1 size-3.5" /> Add variant
              </Button>
            }
          >
            {variants.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No variants — customers buy the product at its main price. Add variants when the
                same product comes in options.
              </p>
            )}
            <div className="space-y-3">
              {variants.map((v, i) => {
                const set = (patch: Partial<Variant>) =>
                  setVariants((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div
                    key={v.id}
                    className="grid grid-cols-2 gap-2 border-b border-border pb-3 last:border-0 sm:grid-cols-[2fr_1fr_1fr_1fr_auto_auto] sm:items-center"
                  >
                    <Input
                      className="col-span-2 sm:col-span-1"
                      placeholder="Option name (e.g. Pack of 4)"
                      value={v.name}
                      onChange={(e) => set({ name: e.target.value })}
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Price"
                      value={v.price}
                      onChange={(e) => set({ price: Number(e.target.value) })}
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Stock"
                      value={v.stock_quantity}
                      onChange={(e) => set({ stock_quantity: Number(e.target.value) })}
                    />
                    <Input
                      placeholder="SKU"
                      value={v.sku ?? ""}
                      onChange={(e) => set({ sku: e.target.value })}
                    />
                    <label className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={v.is_active}
                        onCheckedChange={(x) => set({ is_active: x })}
                      />{" "}
                      On
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove variant"
                      onClick={() => setVariants((p) => p.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Product information">
            <div className="space-y-4">
              {TEXT_FIELDS.map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <Textarea
                    id={key}
                    name={key}
                    rows={key === "description" ? 5 : 3}
                    defaultValue={product?.[key] ?? ""}
                  />
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Availability">
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-3 text-sm">
                Visible in store <Switch checked={active} onCheckedChange={setActive} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                Featured on homepage <Switch checked={featured} onCheckedChange={setFeatured} />
              </label>
            </div>
          </Panel>

          <Panel title="Pricing">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="price">Selling price (₹)</Label>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="compare">Original price (₹) — optional</Label>
                <Input
                  id="compare"
                  type="number"
                  min={0}
                  step="0.01"
                  value={compare}
                  onChange={(e) => setCompare(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {off
                    ? `Shown crossed out with a “${off}% off” badge.`
                    : "Set higher than the selling price to show a discount."}
                </p>
              </div>
            </div>
          </Panel>

          <Panel title="Inventory">
            <div className="grid grid-cols-2 gap-4">
              <F
                label="Stock"
                name="stock_quantity"
                type="number"
                value={product?.stock_quantity ?? 0}
              />
              <F
                label="Low-stock alert at"
                name="low_stock_threshold"
                type="number"
                value={product?.low_stock_threshold ?? 5}
              />
            </div>
          </Panel>

          <Panel title="Organisation">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category_id">Category</Label>
                <select
                  id="category_id"
                  name="category_id"
                  defaultValue={product?.category_id ?? ""}
                  className={selectClass}
                >
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Collections</Label>
                {collections.length === 0 && (
                  <p className="text-xs text-muted-foreground">No collections yet.</p>
                )}
                <div className="space-y-1.5">
                  {collections.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--accent)]"
                        checked={memberOf.includes(c.id)}
                        onChange={(e) =>
                          setMemberOf((prev) =>
                            e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id),
                          )
                        }
                      />
                      {c.name}
                      {!c.is_active && (
                        <span className="text-xs text-muted-foreground">(inactive)</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-[1400px] justify-end gap-2 px-1 sm:px-3 lg:px-7">
          <Button type="button" variant="outline" className="rounded-none" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} className="rounded-none px-8">
            {busy ? "Saving…" : "Save product"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function F({
  label,
  name,
  value,
  type = "text",
}: {
  label: string;
  name: string;
  value?: string | number | null | undefined;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        min={type === "number" ? 0 : undefined}
        defaultValue={value ?? ""}
      />
    </div>
  );
}

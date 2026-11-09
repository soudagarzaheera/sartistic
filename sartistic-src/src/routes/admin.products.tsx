import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/format";
import { uploadImage } from "@/lib/upload";

export const Route = createFileRoute("/admin/products")({
  component: AdminProducts,
});

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
  product_images: { id: string; image_url: string; is_primary: boolean; sort_order: number }[];
  product_variants: { id: string; name: string; price: number; stock_quantity: number; sku: string | null; is_active: boolean }[];
};

const TEXT_FIELDS = [
  ["short_description", "Short description"],
  ["description", "Description"],
  ["ingredients", "Ingredients"],
  ["how_to_use", "How to use"],
  ["storage_instructions", "Storage instructions"],
  ["shipping_information", "Shipping information"],
  ["return_information", "Return information"],
] as const;

function slugify(v: string) {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function AdminProducts() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [search, setSearch] = useState("");

  const products = useQuery({
    queryKey: ["admin", "products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_images(id, image_url, is_primary, sort_order), product_variants(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => (await supabase.from("categories").select("id, name").order("sort_order")).data ?? [],
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  async function remove(id: string) {
    if (!confirm("Delete this product? Past orders keep their saved details.")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error("Couldn't delete — try deactivating it instead.");
    else {
      toast("Product deleted");
      refresh();
    }
  }

  const list = (products.data ?? []).filter((p) =>
    `${p.name} ${p.sku ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  if (editing) {
    return (
      <ProductForm
        product={editing === "new" ? null : editing}
        categories={categories.data ?? []}
        onDone={() => {
          setEditing(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl">Products</h1>
        <div className="flex gap-2">
          <Input placeholder="Search name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 rounded-none" />
          <Button className="rounded-none" onClick={() => setEditing("new")}>New product</Button>
        </div>
      </div>
      <div className="mt-8 overflow-x-auto border border-border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs tracking-[0.14em] text-muted-foreground uppercase">
            <tr>
              <th className="p-3">Product</th><th className="p-3">SKU</th><th className="p-3">Price</th>
              <th className="p-3">Stock</th><th className="p-3">Status</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="flex items-center gap-3 p-3">
                  {p.product_images[0] && <img src={p.product_images[0].image_url} alt="" className="size-10 object-cover" />}
                  {p.name}
                </td>
                <td className="p-3 text-muted-foreground">{p.sku}</td>
                <td className="p-3">{formatPrice(p.price)}</td>
                <td className={`p-3 ${p.stock_quantity <= p.low_stock_threshold ? "text-destructive" : ""}`}>{p.stock_quantity}</td>
                <td className="p-3">{p.is_active ? "Active" : "Hidden"}{p.is_featured ? " · Featured" : ""}</td>
                <td className="space-x-3 p-3 text-right whitespace-nowrap">
                  <button className="underline" onClick={() => setEditing(p)}>Edit</button>
                  <button className="text-destructive underline" onClick={() => void remove(p.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.isLoading && <p className="p-6 text-muted-foreground">Loading…</p>}
      </div>
    </div>
  );
}

function ProductForm({
  product,
  categories,
  onDone,
}: {
  product: Row | null;
  categories: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [featured, setFeatured] = useState(product?.is_featured ?? false);
  const [active, setActive] = useState(product?.is_active ?? true);
  const [images, setImages] = useState(product?.product_images ?? []);
  const [variants, setVariants] = useState(product?.product_variants ?? []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const price = Number(f.get("price"));
    if (!name || !(price > 0)) {
      toast.error("Name and a valid price are required");
      return;
    }
    const compare = Number(f.get("compare_at_price")) || null;
    const payload: Record<string, unknown> = {
      name,
      slug: String(f.get("slug") || slugify(name)),
      sku: String(f.get("sku") ?? "").trim() || null,
      price,
      compare_at_price: compare,
      stock_quantity: Math.max(0, Math.floor(Number(f.get("stock_quantity")) || 0)),
      low_stock_threshold: Math.max(0, Math.floor(Number(f.get("low_stock_threshold")) || 5)),
      category_id: String(f.get("category_id") || "") || null,
      is_featured: featured,
      is_active: active,
    };
    for (const [key] of TEXT_FIELDS) payload[key] = String(f.get(key) ?? "").trim() || null;

    setBusy(true);
    const result = product
      ? await supabase.from("products").update(payload as never).eq("id", product.id).select("id").single()
      : await supabase.from("products").insert(payload as never).select("id").single();
    if (result.error || !result.data) {
      setBusy(false);
      toast.error(/duplicate/i.test(result.error?.message ?? "") ? "That slug or SKU already exists." : "Couldn't save product.");
      return;
    }
    const id = result.data.id;

    // Sync images
    await supabase.from("product_images").delete().eq("product_id", id);
    if (images.length) {
      await supabase.from("product_images").insert(
        images.map((img, i) => ({ product_id: id, image_url: img.image_url, sort_order: i, is_primary: i === 0 })),
      );
    }
    // Sync variants
    const keepIds = variants.filter((v) => !v.id.startsWith("new-")).map((v) => v.id);
    const existing = product?.product_variants.map((v) => v.id) ?? [];
    const removed = existing.filter((v) => !keepIds.includes(v));
    if (removed.length) await supabase.from("product_variants").delete().in("id", removed);
    for (const v of variants) {
      const row = { product_id: id, name: v.name, price: Number(v.price), stock_quantity: Number(v.stock_quantity), sku: v.sku || null, is_active: v.is_active };
      if (v.id.startsWith("new-")) await supabase.from("product_variants").insert(row);
      else await supabase.from("product_variants").update(row).eq("id", v.id);
    }

    setBusy(false);
    toast.success("Product saved");
    onDone();
  }

  async function addImage(file: File | undefined) {
    if (!file) return;
    try {
      const url = await uploadImage("product-images", file, "products");
      setImages((prev) => [...prev, { id: crypto.randomUUID(), image_url: url, is_primary: prev.length === 0, sort_order: prev.length }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  }

  return (
    <form onSubmit={save} className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl">{product ? "Edit product" : "New product"}</h1>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>

      <div className="grid gap-4 bg-background p-6 sm:grid-cols-2">
        <F label="Name" name="name" value={product?.name} />
        <F label="Slug (URL)" name="slug" value={product?.slug} />
        <F label="SKU" name="sku" value={product?.sku} />
        <div className="space-y-2">
          <Label>Category</Label>
          <select name="category_id" defaultValue={product?.category_id ?? ""} className="h-10 w-full border border-border bg-background px-3 text-sm">
            <option value="">None</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <F label="Price (₹)" name="price" type="number" value={product?.price} />
        <F label="Compare-at price (₹)" name="compare_at_price" type="number" value={product?.compare_at_price} />
        <F label="Stock quantity" name="stock_quantity" type="number" value={product?.stock_quantity ?? 0} />
        <F label="Low stock alert at" name="low_stock_threshold" type="number" value={product?.low_stock_threshold ?? 5} />
        <label className="flex items-center gap-3 text-sm"><Switch checked={featured} onCheckedChange={setFeatured} /> Featured</label>
        <label className="flex items-center gap-3 text-sm"><Switch checked={active} onCheckedChange={setActive} /> Visible in store</label>
      </div>

      <div className="bg-background p-6">
        <p className="eyebrow">Images (first is primary)</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {images.map((img, i) => (
            <div key={img.id} className="relative">
              <img src={img.image_url} alt="" className="size-24 object-cover" />
              <button type="button" onClick={() => setImages((p) => p.filter((_, j) => j !== i))} className="absolute top-1 right-1 bg-background px-1.5 text-xs">✕</button>
            </div>
          ))}
          <label className="grid size-24 cursor-pointer place-items-center border border-dashed border-border text-xs text-muted-foreground">
            Upload
            <input type="file" accept="image/*" className="hidden" onChange={(e) => void addImage(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      <div className="bg-background p-6">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Variants</p>
          <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={() => setVariants((v) => [...v, { id: `new-${crypto.randomUUID()}`, name: "", price: 0, stock_quantity: 0, sku: null, is_active: true }])}>Add variant</Button>
        </div>
        <div className="mt-4 space-y-2">
          {variants.map((v, i) => (
            <div key={v.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2">
              <Input placeholder="Name" value={v.name} onChange={(e) => setVariants((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input type="number" placeholder="Price" value={v.price} onChange={(e) => setVariants((p) => p.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} />
              <Input type="number" placeholder="Stock" value={v.stock_quantity} onChange={(e) => setVariants((p) => p.map((x, j) => (j === i ? { ...x, stock_quantity: Number(e.target.value) } : x)))} />
              <Input placeholder="SKU" value={v.sku ?? ""} onChange={(e) => setVariants((p) => p.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))} />
              <Button type="button" variant="ghost" onClick={() => setVariants((p) => p.filter((_, j) => j !== i))}>✕</Button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 bg-background p-6">
        {TEXT_FIELDS.map(([key, label]) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={key}>{label}</Label>
            <Textarea id={key} name={key} rows={3} defaultValue={product?.[key] ?? ""} />
          </div>
        ))}
      </div>

      <Button type="submit" disabled={busy} className="h-12 rounded-none px-10">{busy ? "Saving…" : "Save product"}</Button>
    </form>
  );
}

function F({ label, name, value, type = "text" }: { label: string; name: string; value?: string | number | null | undefined; type?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} step={type === "number" ? "any" : undefined} defaultValue={value ?? ""} />
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { invalidateStorefront } from "@/lib/admin-cache";
import { IMAGE_BUCKETS } from "@/lib/upload";
import {
  ImageUploader,
  PageHeader,
  Panel,
  StatusPill,
  dbErrorMessage,
  slugify,
  useConfirm,
} from "@/components/admin/ui";

export const Route = createFileRoute("/admin/collections")({
  component: AdminCollections,
});

type CollectionRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  collection_products: { product_id: string; sort_order: number }[];
};

type ProductLite = {
  id: string;
  name: string;
  sku: string | null;
  is_active: boolean;
  product_images: { image_url: string; is_primary: boolean; sort_order: number }[];
};

function thumb(p: ProductLite) {
  return [...p.product_images].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
  )[0]?.image_url;
}

function AdminCollections() {
  const queryClient = useQueryClient();
  const [confirm, confirmDialog] = useConfirm();
  const [editing, setEditing] = useState<CollectionRow | "new" | null>(null);

  const collections = useQuery({
    queryKey: ["admin", "collections", "full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("*, collection_products(product_id, sort_order)")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CollectionRow[];
    },
  });
  const products = useQuery({
    queryKey: ["admin", "products", "lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, is_active, product_images(image_url, is_primary, sort_order)")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProductLite[];
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
    invalidateStorefront(queryClient);
  };

  async function patch(c: CollectionRow, values: { is_active?: boolean; is_featured?: boolean }) {
    const { error } = await supabase.from("collections").update(values).eq("id", c.id);
    if (error) toast.error(dbErrorMessage(error, "Couldn't update collection"));
    else {
      toast.success("Collection updated");
      refresh();
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const list = [...(collections.data ?? [])];
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j]!, list[index]!];
    const results = await Promise.all(
      list.map((c, i) =>
        supabase
          .from("collections")
          .update({ sort_order: (i + 1) * 10 })
          .eq("id", c.id),
      ),
    );
    if (results.some((r) => r.error)) toast.error("Couldn't save the new order");
    refresh();
  }

  async function remove(c: CollectionRow) {
    const ok = await confirm({
      title: `Delete “${c.name}”?`,
      description: "The collection is removed from the store. Its products are not deleted.",
      confirmLabel: "Delete collection",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("collections").delete().eq("id", c.id);
    if (error) toast.error(dbErrorMessage(error, "Couldn't delete collection"));
    else {
      toast.success("Collection deleted");
      refresh();
    }
  }

  if (editing) {
    return (
      <CollectionForm
        collection={editing === "new" ? null : editing}
        products={products.data ?? []}
        nextSort={((collections.data?.length ?? 0) + 1) * 10}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div>
      {confirmDialog}
      <PageHeader
        title="Collections"
        description="Curated groups of products shown on /collections. Featured collections appear on the homepage. Use the arrows to set display order."
        actions={
          <Button className="rounded-none" onClick={() => setEditing("new")}>
            <Plus className="mr-1 size-4" /> New collection
          </Button>
        }
      />

      <div className="mt-6 space-y-3">
        {collections.isLoading && (
          <p className="text-sm text-muted-foreground">Loading collections…</p>
        )}
        {collections.isError && (
          <p className="text-sm text-destructive">
            Couldn't load collections. Has the admin database migration been applied?
          </p>
        )}
        {collections.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No collections yet.</p>
        )}
        {collections.data?.map((c, i) => (
          <div
            key={c.id}
            className="flex flex-col gap-4 border border-border bg-background p-4 sm:flex-row sm:items-center"
          >
            <div className="flex items-center gap-4 sm:flex-1">
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => void move(i, -1)}
                  className="p-1 disabled:opacity-25"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={i === (collections.data?.length ?? 0) - 1}
                  onClick={() => void move(i, 1)}
                  className="p-1 disabled:opacity-25"
                >
                  <ArrowDown className="size-4" />
                </button>
              </div>
              {c.image_url ? (
                <img src={c.image_url} alt="" className="size-16 shrink-0 object-cover" />
              ) : (
                <span className="size-16 shrink-0 bg-secondary" />
              )}
              <div className="min-w-0">
                <p className="font-display text-xl">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  /collections/{c.slug} · {c.collection_products.length} products
                </p>
                <div className="mt-1 flex gap-1.5">
                  {!c.is_active && <StatusPill>Hidden</StatusPill>}
                  {c.is_featured && <StatusPill tone="good">Featured</StatusPill>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <Switch
                  checked={c.is_active}
                  onCheckedChange={(v) => void patch(c, { is_active: v })}
                />{" "}
                Active
              </label>
              <label className="flex items-center gap-2">
                <Switch
                  checked={c.is_featured}
                  onCheckedChange={(v) => void patch(c, { is_featured: v })}
                />{" "}
                Featured
              </label>
              <button className="underline underline-offset-4" onClick={() => setEditing(c)}>
                Edit
              </button>
              <button
                className="text-destructive underline underline-offset-4"
                onClick={() => void remove(c)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CollectionForm({
  collection,
  products,
  nextSort,
  onClose,
  onSaved,
}: {
  collection: CollectionRow | null;
  products: ProductLite[];
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(collection?.name ?? "");
  const [slug, setSlug] = useState(collection?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(collection));
  const [description, setDescription] = useState(collection?.description ?? "");
  const [image, setImage] = useState<string | null>(collection?.image_url ?? null);
  const [active, setActive] = useState(collection?.is_active ?? true);
  const [featured, setFeatured] = useState(collection?.is_featured ?? false);
  const [members, setMembers] = useState<string[]>(
    [...(collection?.collection_products ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => m.product_id),
  );
  const [search, setSearch] = useState("");

  const byId = new Map(products.map((p) => [p.id, p]));
  const available = products.filter(
    (p) =>
      !members.includes(p.id) &&
      `${p.name} ${p.sku ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  function move(i: number, dir: -1 | 1) {
    setMembers((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const finalSlug = slugify(slug || name);
    if (!name.trim()) return void toast.error("Collection name is required");
    if (!finalSlug) return void toast.error("Enter a valid URL slug");
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        slug: finalSlug,
        description: description.trim() || null,
        image_url: image,
        is_active: active,
        is_featured: featured,
      };
      const result = collection
        ? await supabase
            .from("collections")
            .update(payload)
            .eq("id", collection.id)
            .select("id")
            .single()
        : await supabase
            .from("collections")
            .insert({ ...payload, sort_order: nextSort })
            .select("id")
            .single();
      if (result.error || !result.data)
        throw new Error(dbErrorMessage(result.error, "Couldn't save collection"));
      const id = result.data.id;

      const del = await supabase.from("collection_products").delete().eq("collection_id", id);
      if (del.error) throw new Error("Collection saved, but its products couldn't be updated.");
      if (members.length) {
        const ins = await supabase
          .from("collection_products")
          .insert(
            members.map((product_id, i) => ({ collection_id: id, product_id, sort_order: i })),
          );
        if (ins.error) throw new Error("Collection saved, but its products couldn't be updated.");
      }
      toast.success(collection ? "Collection updated" : "Collection created");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save collection");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All collections
      </button>
      <PageHeader title={collection ? `Edit ${collection.name}` : "New collection"} />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <Panel title="Details">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  required
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slugTouched) setSlug(slugify(e.target.value));
                  }}
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
                  /collections/{slugify(slug || name) || "…"}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <label className="flex items-center justify-between text-sm">
                Active (visible on store) <Switch checked={active} onCheckedChange={setActive} />
              </label>
              <label className="flex items-center justify-between text-sm">
                Featured on homepage <Switch checked={featured} onCheckedChange={setFeatured} />
              </label>
            </div>
          </Panel>

          <Panel title="Cover image">
            {image ? (
              <div className="space-y-3">
                <img src={image} alt="" className="aspect-[16/10] w-full object-cover" />
                <div className="flex gap-2">
                  <ImageUploader
                    bucket={IMAGE_BUCKETS.collections}
                    folder="covers"
                    multiple={false}
                    label="Replace image"
                    className="flex-1"
                    onUploaded={(urls) => setImage(urls[0] ?? null)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto rounded-none"
                    onClick={() => setImage(null)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <ImageUploader
                bucket={IMAGE_BUCKETS.collections}
                folder="covers"
                multiple={false}
                label="Upload cover image"
                onUploaded={(urls) => setImage(urls[0] ?? null)}
              />
            )}
          </Panel>
        </div>

        <Panel title={`Products in this collection (${members.length})`}>
          {members.length === 0 && (
            <p className="mb-4 text-sm text-muted-foreground">No products yet — add some below.</p>
          )}
          <ul className="space-y-2">
            {members.map((pid, i) => {
              const p = byId.get(pid);
              if (!p) return null;
              return (
                <li key={pid} className="flex items-center gap-3 border border-border p-2">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      className="disabled:opacity-25"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === members.length - 1}
                      onClick={() => move(i, 1)}
                      className="disabled:opacity-25"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                  </div>
                  {thumb(p) ? (
                    <img src={thumb(p)} alt="" className="size-10 object-cover" />
                  ) : (
                    <span className="size-10 bg-secondary" />
                  )}
                  <span className="flex-1 text-sm">
                    {p.name}{" "}
                    {!p.is_active && (
                      <span className="text-xs text-muted-foreground">(hidden)</span>
                    )}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => setMembers((m) => m.filter((x) => x !== pid))}
                    className="p-1 text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 border-t border-border pt-4">
            <p className="eyebrow mb-3">Add products</p>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search products"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
              {available.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setMembers((m) => [...m, p.id])}
                    className="flex w-full items-center gap-3 p-2 text-left text-sm hover:bg-secondary"
                  >
                    {thumb(p) ? (
                      <img src={thumb(p)} alt="" className="size-8 object-cover" />
                    ) : (
                      <span className="size-8 bg-secondary" />
                    )}
                    <span className="flex-1">{p.name}</span>
                    <Plus className="size-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
              {available.length === 0 && (
                <li className="p-2 text-xs text-muted-foreground">No more products to add.</li>
              )}
            </ul>
          </div>
        </Panel>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" className="rounded-none" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy} className="rounded-none px-8">
          {busy ? "Saving…" : "Save collection"}
        </Button>
      </div>
    </form>
  );
}

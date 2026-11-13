import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Copy, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { IMAGE_BUCKETS, type ImageBucket } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { ImageUploader, PageHeader, StatusPill, useConfirm } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/images")({
  component: AdminImages,
});

const TABS: { bucket: ImageBucket; label: string }[] = [
  { bucket: IMAGE_BUCKETS.products, label: "Product images" },
  { bucket: IMAGE_BUCKETS.homepage, label: "Homepage banners" },
  { bucket: IMAGE_BUCKETS.collections, label: "Collection images" },
  { bucket: IMAGE_BUCKETS.gallery, label: "Design gallery" },
];

type StoredFile = { path: string; url: string; size: number; created: string | null };

/** Lists every file in a bucket (one level of folders deep, which is how uploads are stored). */
async function listBucket(bucket: string): Promise<StoredFile[]> {
  const files: StoredFile[] = [];
  const walk = async (prefix: string, depth: number) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw error;
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        if (depth < 2) await walk(path, depth + 1);
        continue;
      }
      if (item.name === ".emptyFolderPlaceholder") continue;
      files.push({
        path,
        url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl,
        size: Number((item.metadata as { size?: number } | null)?.size ?? 0),
        created: item.created_at ?? null,
      });
    }
  };
  await walk("", 0);
  return files.sort((a, b) => (b.created ?? "").localeCompare(a.created ?? ""));
}

/** URLs referenced anywhere in the store, used to warn before deleting. */
async function referencedUrls(): Promise<Set<string>> {
  const [images, collections, categories, gallery, homepage] = await Promise.all([
    supabase.from("product_images").select("image_url"),
    supabase.from("collections").select("image_url"),
    supabase.from("categories").select("image_url"),
    supabase.from("gallery_images").select("image_url"),
    supabase.from("homepage_sections").select("content"),
  ]);
  const set = new Set<string>();
  const add = (u: unknown) => typeof u === "string" && u && set.add(u.split("?")[0]!);
  images.data?.forEach((r) => add(r.image_url));
  collections.data?.forEach((r) => add(r.image_url));
  categories.data?.forEach((r) => add(r.image_url));
  gallery.data?.forEach((r) => add(r.image_url));
  homepage.data?.forEach((r) =>
    Object.values((r.content ?? {}) as Record<string, unknown>).forEach(add),
  );
  return set;
}

function formatSize(bytes: number) {
  if (!bytes) return "";
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

function AdminImages() {
  const queryClient = useQueryClient();
  const [confirm, confirmDialog] = useConfirm();
  const [bucket, setBucket] = useState<ImageBucket>(IMAGE_BUCKETS.products);
  const [search, setSearch] = useState("");

  const files = useQuery({
    queryKey: ["admin", "images", bucket],
    queryFn: () => listBucket(bucket),
  });
  const used = useQuery({ queryKey: ["admin", "images", "used"], queryFn: referencedUrls });

  const isUsed = (url: string) => {
    if (!used.data) return false;
    if (used.data.has(url)) return true;
    // Older uploads were stored as signed URLs for the same object path.
    const path = url.split("/storage/v1/object/public/")[1];
    return Boolean(path && [...used.data].some((u) => u.includes(path)));
  };

  const list = useMemo(
    () => (files.data ?? []).filter((f) => f.path.toLowerCase().includes(search.toLowerCase())),
    [files.data, search],
  );

  async function remove(f: StoredFile) {
    const inUse = isUsed(f.url);
    const ok = await confirm({
      title: "Delete this image?",
      description: inUse
        ? "This image is currently used on the store. Deleting it will leave a broken image wherever it appears."
        : "The file is permanently deleted from storage.",
      confirmLabel: "Delete image",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.storage.from(bucket).remove([f.path]);
    if (error) toast.error("Couldn't delete the image");
    else {
      toast.success("Image deleted");
      void queryClient.invalidateQueries({ queryKey: ["admin", "images"] });
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Image link copied");
    } catch {
      toast.error("Couldn't copy — select and copy the link manually");
    }
  }

  return (
    <div>
      {confirmDialog}
      <PageHeader
        title="Image Library"
        description="All images stored in Supabase Storage. They stay online independently of GitHub and Vercel deployments."
      />

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.bucket}
            type="button"
            onClick={() => setBucket(t.bucket)}
            className={cn(
              "border-b-2 px-4 py-2.5 text-sm whitespace-nowrap",
              bucket === t.bucket
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter by file name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-none pl-9"
            />
          </div>
          {files.isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading images…</p>}
          {files.isError && (
            <p className="mt-6 text-sm text-destructive">
              Couldn't list this bucket. Has the admin database migration (storage buckets and
              policies) been applied?
            </p>
          )}
          {!files.isLoading && list.length === 0 && !files.isError && (
            <p className="mt-6 text-sm text-muted-foreground">No images here yet.</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {list.map((f) => (
              <figure key={f.path} className="border border-border bg-background">
                <a href={f.url} target="_blank" rel="noreferrer">
                  <img
                    src={f.url}
                    alt=""
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                </a>
                <figcaption className="space-y-2 p-2 text-xs">
                  <p className="truncate text-muted-foreground" title={f.path}>
                    {f.path}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{formatSize(f.size)}</span>
                    {used.data &&
                      (isUsed(f.url) ? (
                        <StatusPill tone="good">In use</StatusPill>
                      ) : (
                        <StatusPill>Unused</StatusPill>
                      ))}
                  </div>
                  <div className="flex justify-between">
                    <button
                      type="button"
                      onClick={() => void copy(f.url)}
                      className="flex items-center gap-1 hover:text-accent"
                    >
                      <Copy className="size-3.5" /> Copy link
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(f)}
                      className="flex items-center gap-1 text-destructive"
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div className="h-fit border border-border bg-background p-5 lg:sticky lg:top-6">
          <p className="eyebrow mb-4">Upload to {TABS.find((t) => t.bucket === bucket)?.label}</p>
          <ImageUploader
            key={bucket}
            bucket={bucket}
            folder="library"
            onUploaded={() =>
              void queryClient.invalidateQueries({ queryKey: ["admin", "images", bucket] })
            }
          />
          <p className="mt-4 text-xs text-muted-foreground">
            Large photos are resized to 2400px and converted to WebP automatically. To put an image
            on a product, collection or the homepage, upload it from that editor — or copy its link
            from here.
          </p>
        </div>
      </div>
    </div>
  );
}

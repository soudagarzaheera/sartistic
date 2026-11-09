import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { uploadImage } from "@/lib/upload";

export const Route = createFileRoute("/admin/gallery")({
  component: AdminGallery,
});

function AdminGallery() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [newCat, setNewCat] = useState("");

  const images = useQuery({
    queryKey: ["admin", "gallery"],
    queryFn: async () => (await supabase.from("gallery_images").select("*").order("sort_order")).data ?? [],
  });
  const categories = useQuery({
    queryKey: ["admin", "gallery-cats"],
    queryFn: async () => (await supabase.from("gallery_categories").select("*").order("name")).data ?? [],
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "gallery"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "gallery-cats"] });
    void queryClient.invalidateQueries({ queryKey: ["gallery-images"] });
    void queryClient.invalidateQueries({ queryKey: ["gallery-categories"] });
  };

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage("gallery-images", file, "gallery");
      const { error } = await supabase.from("gallery_images").insert({
        image_url: url,
        title: file.name.replace(/\.[^.]+$/, ""),
        sort_order: (images.data?.length ?? 0) + 1,
        is_active: true,
      });
      if (error) throw new Error("Couldn't save image");
      toast.success("Image added");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function patch(id: string, values: Record<string, unknown>) {
    const { error } = await supabase.from("gallery_images").update(values as never).eq("id", id);
    if (error) toast.error("Couldn't update");
    else refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this image?")) return;
    await supabase.from("gallery_images").delete().eq("id", id);
    refresh();
  }
  async function addCategory() {
    const name = newCat.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const { error } = await supabase.from("gallery_categories").insert({ name, slug });
    if (error) toast.error("Couldn't add category");
    else {
      setNewCat("");
      refresh();
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl">Gallery</h1>
        <label className="cursor-pointer bg-primary px-5 py-2.5 text-sm text-primary-foreground">
          {uploading ? "Uploading…" : "Upload image"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 bg-background p-4 text-sm">
        <span className="eyebrow mr-2">Categories</span>
        {categories.data?.map((c) => <span key={c.id} className="border border-border px-2 py-1">{c.name}</span>)}
        <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category" className="h-8 w-40 rounded-none" />
        <Button size="sm" variant="outline" className="rounded-none" onClick={() => void addCategory()}>Add</Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {images.data?.map((img) => (
          <div key={img.id} className="space-y-2 border border-border bg-background p-3 text-sm">
            <img src={img.image_url} alt="" className="aspect-[4/3] w-full object-cover" />
            <Input defaultValue={img.title ?? ""} placeholder="Title" onBlur={(e) => e.target.value !== (img.title ?? "") && void patch(img.id, { title: e.target.value })} />
            <Input defaultValue={img.description ?? ""} placeholder="Description" onBlur={(e) => e.target.value !== (img.description ?? "") && void patch(img.id, { description: e.target.value })} />
            <div className="flex items-center gap-2">
              <select value={img.category_id ?? ""} onChange={(e) => void patch(img.id, { category_id: e.target.value || null })} className="flex-1 border border-border bg-background p-2">
                <option value="">No category</option>
                {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Input type="number" defaultValue={img.sort_order} className="w-20" onBlur={(e) => void patch(img.id, { sort_order: Number(e.target.value) })} />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2"><Switch checked={img.is_active} onCheckedChange={(v) => void patch(img.id, { is_active: v })} /> Active</label>
              <button className="text-destructive underline" onClick={() => void remove(img.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

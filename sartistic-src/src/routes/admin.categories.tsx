import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { invalidateStorefront } from "@/lib/admin-cache";
import { PageHeader, StatusPill, dbErrorMessage, slugify, useConfirm } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/categories")({
  component: AdminCategories,
});

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  products: { count: number }[];
};

function AdminCategories() {
  const queryClient = useQueryClient();
  const [confirm, confirmDialog] = useConfirm();
  const [editing, setEditing] = useState<Category | "new" | null>(null);

  const categories = useQuery({
    queryKey: ["admin", "categories", "full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, description, is_active, sort_order, products(count)")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Category[];
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
    invalidateStorefront(queryClient);
  };

  async function toggle(c: Category, is_active: boolean) {
    const { error } = await supabase.from("categories").update({ is_active }).eq("id", c.id);
    if (error) toast.error(dbErrorMessage(error, "Couldn't update category"));
    else {
      toast.success(is_active ? `${c.name} activated` : `${c.name} deactivated`);
      refresh();
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const list = [...(categories.data ?? [])];
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j]!, list[index]!];
    const results = await Promise.all(
      list.map((c, i) =>
        supabase
          .from("categories")
          .update({ sort_order: i + 1 })
          .eq("id", c.id),
      ),
    );
    if (results.some((r) => r.error)) toast.error("Couldn't save the new order");
    refresh();
  }

  async function remove(c: Category) {
    const count = c.products[0]?.count ?? 0;
    const ok = await confirm({
      title: `Delete “${c.name}”?`,
      description: count
        ? `${count} product(s) use this category. They will stay in the store without a category.`
        : "This category has no products.",
      confirmLabel: "Delete category",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("categories").delete().eq("id", c.id);
    if (error) toast.error(dbErrorMessage(error, "Couldn't delete category"));
    else {
      toast.success("Category deleted");
      refresh();
    }
  }

  return (
    <div>
      {confirmDialog}
      <PageHeader
        title="Categories"
        description="Product types used for filtering in the shop and on product pages."
        actions={
          <Button className="rounded-none" onClick={() => setEditing("new")}>
            <Plus className="mr-1 size-4" /> New category
          </Button>
        }
      />

      <div className="mt-6 overflow-x-auto border border-border bg-background">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="border-b border-border text-left text-[0.68rem] tracking-[0.14em] text-muted-foreground uppercase">
            <tr>
              <th className="w-16 p-3 font-normal">Order</th>
              <th className="p-3 font-normal">Category</th>
              <th className="p-3 font-normal">Products</th>
              <th className="p-3 font-normal">Active</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {categories.data?.map((c, i) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="p-3">
                  <div className="flex">
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
                      disabled={i === (categories.data?.length ?? 0) - 1}
                      onClick={() => void move(i, 1)}
                      className="p-1 disabled:opacity-25"
                    >
                      <ArrowDown className="size-4" />
                    </button>
                  </div>
                </td>
                <td className="p-3">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.slug}</p>
                </td>
                <td className="p-3">{c.products[0]?.count ?? 0}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={c.is_active} onCheckedChange={(v) => void toggle(c, v)} />
                    {!c.is_active && <StatusPill>Hidden</StatusPill>}
                  </div>
                </td>
                <td className="space-x-3 p-3 text-right whitespace-nowrap">
                  <button className="underline underline-offset-4" onClick={() => setEditing(c)}>
                    Edit
                  </button>
                  <button
                    className="text-destructive underline underline-offset-4"
                    onClick={() => void remove(c)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {categories.isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
        {categories.data?.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">No categories yet.</p>
        )}
      </div>

      <CategoryDialog
        category={editing}
        nextSort={(categories.data?.length ?? 0) + 1}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    </div>
  );
}

function CategoryDialog({
  category,
  nextSort,
  onClose,
  onSaved,
}: {
  category: Category | "new" | null;
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = category && category !== "new" ? category : null;
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const slug = slugify(String(f.get("slug") || name));
    if (!name || !slug) return void toast.error("Name is required");
    const payload = {
      name,
      slug,
      description: String(f.get("description") ?? "").trim() || null,
      is_active: f.get("is_active") === "on",
    };
    setBusy(true);
    const { error } = existing
      ? await supabase.from("categories").update(payload).eq("id", existing.id)
      : await supabase.from("categories").insert({ ...payload, sort_order: nextSort });
    setBusy(false);
    if (error) return void toast.error(dbErrorMessage(error, "Couldn't save category"));
    toast.success(existing ? "Category updated" : "Category created");
    onSaved();
  }

  return (
    <Dialog open={Boolean(category)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-none">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">
            {existing ? "Edit category" : "New category"}
          </DialogTitle>
        </DialogHeader>
        <form key={existing?.id ?? "new"} onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" name="name" defaultValue={existing?.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-slug">Slug (leave blank to generate)</Label>
            <Input id="cat-slug" name="slug" defaultValue={existing?.slug} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-desc">Description</Label>
            <Textarea
              id="cat-desc"
              name="description"
              rows={3}
              defaultValue={existing?.description ?? ""}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={existing?.is_active ?? true}
              className="size-4"
            />{" "}
            Active
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-none" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="rounded-none">
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

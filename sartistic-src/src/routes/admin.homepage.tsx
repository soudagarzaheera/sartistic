import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { invalidateStorefront } from "@/lib/admin-cache";
import { IMAGE_BUCKETS } from "@/lib/upload";
import { cn } from "@/lib/utils";
import {
  ImageUploader,
  PageHeader,
  Panel,
  StatusPill,
  dbErrorMessage,
} from "@/components/admin/ui";

export const Route = createFileRoute("/admin/homepage")({
  component: AdminHomepage,
});

type Field = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "image" | "lines";
  hint?: string;
};

const HEADING: Field[] = [
  { name: "eyebrow", label: "Small heading" },
  { name: "title", label: "Title" },
];

const FIELDS: Record<string, Field[]> = {
  hero: [
    { name: "image_url", label: "Banner image", type: "image" },
    { name: "image_alt", label: "Banner image description (for accessibility)" },
    { name: "eyebrow", label: "Small heading" },
    { name: "heading", label: "Heading", type: "textarea", hint: "Press Enter for a line break." },
    { name: "subtitle", label: "Subtitle", type: "textarea" },
    { name: "primary_label", label: "Main button text" },
    {
      name: "primary_link",
      label: "Main button link",
      hint: "e.g. /shop or /collections/bridal-collection",
    },
    {
      name: "secondary_label",
      label: "Second button text",
      hint: "Leave empty to hide the second button.",
    },
    { name: "secondary_link", label: "Second button link" },
  ],
  promo: [
    {
      name: "text",
      label: "Promotional message",
      hint: "Shown as a band under the hero. Leave empty to hide.",
    },
    { name: "link_label", label: "Link text" },
    { name: "link", label: "Link" },
  ],
  trust: [{ name: "items", label: "Trust points", type: "lines", hint: "One per line." }],
  featured_products: [...HEADING, { name: "subtitle", label: "Subtitle" }],
  collections: [...HEADING, { name: "subtitle", label: "Subtitle" }],
  story: [
    { name: "image_url", label: "Image", type: "image" },
    { name: "image_alt", label: "Image description" },
    { name: "eyebrow", label: "Small heading" },
    { name: "title", label: "Title", type: "textarea" },
    {
      name: "body",
      label: "Text",
      type: "textarea",
      hint: "Leave a blank line between paragraphs.",
    },
  ],
  why: HEADING,
  gallery: [...HEADING, { name: "subtitle", label: "Subtitle" }],
  how_to_use: HEADING,
  reviews: HEADING,
  social: HEADING,
  faq: HEADING,
  cta: [
    ...HEADING,
    { name: "subtitle", label: "Subtitle" },
    { name: "button_label", label: "Button text" },
    { name: "button_link", label: "Button link" },
  ],
};

type Section = {
  id: string;
  key: string;
  label: string;
  is_visible: boolean;
  sort_order: number;
  content: Record<string, unknown>;
  updated_at: string;
};

function AdminHomepage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>("hero");

  const sections = useQuery({
    queryKey: ["admin", "homepage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homepage_sections")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Section[];
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "homepage"] });
    invalidateStorefront(queryClient);
  };

  async function toggle(s: Section, is_visible: boolean) {
    const { error } = await supabase
      .from("homepage_sections")
      .update({ is_visible })
      .eq("id", s.id);
    if (error) toast.error(dbErrorMessage(error, "Couldn't update section"));
    else {
      toast.success(`${s.label} ${is_visible ? "shown" : "hidden"}`);
      refresh();
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const list = [...(sections.data ?? [])];
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j]!, list[index]!];
    const results = await Promise.all(
      list.map((s, i) =>
        supabase
          .from("homepage_sections")
          .update({ sort_order: (i + 1) * 10 })
          .eq("id", s.id),
      ),
    );
    if (results.some((r) => r.error)) toast.error("Couldn't save the new order");
    refresh();
  }

  const current = sections.data?.find((s) => s.key === selected) ?? sections.data?.[0];

  return (
    <div>
      <PageHeader
        title="Homepage"
        description="Edit the banner, text and sections of the homepage. Changes are live as soon as you save."
        actions={
          <Button asChild variant="outline" className="rounded-none">
            <a href="/" target="_blank" rel="noreferrer">
              View homepage <ExternalLink className="ml-2 size-3.5" />
            </a>
          </Button>
        }
      />

      {sections.isError && (
        <p className="mt-6 text-sm text-destructive">
          Couldn't load homepage content. Has the admin database migration been applied?
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <Panel title="Sections (top to bottom)" className="h-fit">
          <ul className="space-y-1">
            {sections.data?.map((s, i) => (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-2 border px-2 py-2",
                  current?.id === s.id ? "border-accent bg-secondary/60" : "border-transparent",
                )}
              >
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => void move(i, -1)}
                    className="disabled:opacity-25"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === (sections.data?.length ?? 0) - 1}
                    onClick={() => void move(i, 1)}
                    className="disabled:opacity-25"
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(s.key)}
                  className={cn(
                    "flex-1 text-left text-sm",
                    !s.is_visible && "text-muted-foreground",
                  )}
                >
                  {s.label}
                </button>
                <Switch
                  checked={s.is_visible}
                  onCheckedChange={(v) => void toggle(s, v)}
                  aria-label={`Show ${s.label}`}
                />
              </li>
            ))}
          </ul>
        </Panel>

        {current && (
          <div className="space-y-6">
            <SectionEditor
              key={current.id + current.updated_at}
              section={current}
              onSaved={refresh}
            />
            {current.key === "featured_products" && <FeaturedProducts onChange={refresh} />}
            {current.key === "collections" && <FeaturedCollections onChange={refresh} />}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionEditor({ section, onSaved }: { section: Section; onSaved: () => void }) {
  const fields = FIELDS[section.key] ?? HEADING;
  const [values, setValues] = useState<Record<string, unknown>>(section.content ?? {});
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(section.content ?? {});

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (name: string, value: unknown) => setValues((v) => ({ ...v, [name]: value }));

  async function save() {
    for (const f of fields) {
      const v = values[f.name];
      if (f.name.endsWith("link") && typeof v === "string" && v && !/^(\/|https?:\/\/)/.test(v)) {
        return void toast.error(`${f.label} must start with / or https://`);
      }
    }
    setBusy(true);
    const { error } = await supabase
      .from("homepage_sections")
      .update({ content: values as Json })
      .eq("id", section.id);
    setBusy(false);
    if (error) return void toast.error(dbErrorMessage(error, "Couldn't save section"));
    toast.success(`${section.label} saved — live on the homepage`);
    onSaved();
  }

  return (
    <Panel
      title={section.label}
      actions={!section.is_visible ? <StatusPill>Hidden on homepage</StatusPill> : undefined}
    >
      <div className="space-y-5">
        {fields.map((f) => {
          const raw = values[f.name];
          const value = typeof raw === "string" ? raw : "";
          return (
            <div key={f.name} className="space-y-2">
              <Label htmlFor={`f-${f.name}`}>{f.label}</Label>
              {f.type === "image" ? (
                <div className="space-y-3">
                  {value && <img src={value} alt="" className="max-h-64 w-full object-cover" />}
                  <ImageUploader
                    bucket={IMAGE_BUCKETS.homepage}
                    folder={section.key}
                    multiple={false}
                    label={value ? "Replace image" : "Upload image"}
                    onUploaded={(urls) => urls[0] && set(f.name, urls[0])}
                  />
                </div>
              ) : f.type === "textarea" ? (
                <Textarea
                  id={`f-${f.name}`}
                  rows={f.name === "body" ? 6 : 3}
                  value={value}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              ) : f.type === "lines" ? (
                <Textarea
                  id={`f-${f.name}`}
                  rows={5}
                  value={Array.isArray(raw) ? raw.join("\n") : ""}
                  onChange={(e) => set(f.name, e.target.value.split("\n"))}
                />
              ) : (
                <Input
                  id={`f-${f.name}`}
                  value={value}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )}
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          Empty fields fall back to the original wording.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-none"
            disabled={!dirty || busy}
            onClick={() => setValues(section.content ?? {})}
          >
            Discard changes
          </Button>
          <Button
            type="button"
            className="rounded-none px-8"
            disabled={!dirty || busy}
            onClick={() => {
              if (Array.isArray(values["items"]))
                set("items", (values["items"] as string[]).map((x) => x.trim()).filter(Boolean));
              void save();
            }}
          >
            {busy ? "Saving…" : "Save section"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function FeaturedProducts({ onChange }: { onChange: () => void }) {
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: ["admin", "products", "featured-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, is_featured, is_active, product_images(image_url, is_primary, sort_order)",
        )
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function toggle(id: string, is_featured: boolean) {
    const { error } = await supabase.from("products").update({ is_featured }).eq("id", id);
    if (error) return void toast.error("Couldn't update product");
    void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    onChange();
  }

  return (
    <Panel title="Featured products (up to 8 shown)">
      <ul className="grid gap-2 sm:grid-cols-2">
        {products.data?.map((p) => {
          const img = [...p.product_images].sort(
            (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
          )[0];
          return (
            <li key={p.id} className="flex items-center gap-3 border border-border p-2 text-sm">
              {img ? (
                <img src={img.image_url} alt="" className="size-10 object-cover" />
              ) : (
                <span className="size-10 bg-secondary" />
              )}
              <span className="flex-1">
                {p.name}{" "}
                {!p.is_active && <span className="text-xs text-muted-foreground">(hidden)</span>}
              </span>
              <Switch
                checked={p.is_featured}
                onCheckedChange={(v) => void toggle(p.id, v)}
                aria-label={`Feature ${p.name}`}
              />
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function FeaturedCollections({ onChange }: { onChange: () => void }) {
  const queryClient = useQueryClient();
  const collections = useQuery({
    queryKey: ["admin", "collections", "featured-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("id, name, is_featured, is_active, image_url")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function toggle(id: string, is_featured: boolean) {
    const { error } = await supabase.from("collections").update({ is_featured }).eq("id", id);
    if (error) return void toast.error("Couldn't update collection");
    void queryClient.invalidateQueries({ queryKey: ["admin", "collections"] });
    onChange();
  }

  return (
    <Panel title="Featured collections">
      <p className="mb-3 text-xs text-muted-foreground">Order follows the Collections page.</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {collections.data?.map((c) => (
          <li key={c.id} className="flex items-center gap-3 border border-border p-2 text-sm">
            {c.image_url ? (
              <img src={c.image_url} alt="" className="size-10 object-cover" />
            ) : (
              <span className="size-10 bg-secondary" />
            )}
            <span className="flex-1">
              {c.name}{" "}
              {!c.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
            </span>
            <Switch
              checked={c.is_featured}
              onCheckedChange={(v) => void toggle(c.id, v)}
              aria-label={`Feature ${c.name}`}
            />
          </li>
        ))}
        {collections.data?.length === 0 && (
          <li className="text-sm text-muted-foreground">No collections yet.</li>
        )}
      </ul>
    </Panel>
  );
}

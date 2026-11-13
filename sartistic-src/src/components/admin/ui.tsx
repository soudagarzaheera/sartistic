import { useCallback, useRef, useState, type ReactNode } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ACCEPT_ATTR, uploadImage, validateImage, type ImageBucket } from "@/lib/upload";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl md:text-4xl">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  children,
  className,
  actions,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={cn("border border-border bg-background p-5 md:p-6", className)}>
      {(title || actions) && (
        <div className="mb-5 flex items-center justify-between gap-3">
          {title && <p className="eyebrow">{title}</p>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "bad";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-block border px-2 py-0.5 text-[0.65rem] tracking-[0.14em] uppercase whitespace-nowrap",
        tone === "good" &&
          "border-emerald-700/30 bg-emerald-700/10 text-emerald-800 dark:text-emerald-300",
        tone === "warn" && "border-amber-600/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
        tone === "bad" && "border-destructive/30 bg-destructive/10 text-destructive",
        tone === "neutral" && "border-border bg-secondary text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export const selectClass =
  "h-10 w-full border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
};

/**
 * Promise-based confirmation dialog: `if (!(await confirm({...}))) return;`
 * Render the returned element once in the component.
 */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => {});

  const confirm = useCallback((options: ConfirmOptions) => {
    setState({ ...options, open: true });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    resolver.current(value);
    setState((s) => (s ? { ...s, open: false } : s));
  };

  const element = (
    <AlertDialog open={Boolean(state?.open)} onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent className="rounded-none">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-2xl font-normal">
            {state?.title}
          </AlertDialogTitle>
          {state?.description && (
            <AlertDialogDescription>{state.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-none" onClick={() => close(false)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              "rounded-none",
              state?.destructive &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
            onClick={() => close(true)}
          >
            {state?.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [confirm, element] as const;
}

type UploadJob = { id: string; name: string; preview: string; progress: number; error?: string };

/**
 * Multi-file image uploader with local previews and per-file progress.
 * Calls onUploaded with the public URLs of the files that succeeded.
 */
export function ImageUploader({
  bucket,
  folder = "",
  multiple = true,
  onUploaded,
  label = "Upload images",
  className,
  compact = false,
}: {
  bucket: ImageBucket;
  folder?: string;
  multiple?: boolean;
  onUploaded: (urls: string[]) => void;
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [dragging, setDragging] = useState(false);
  const busy = jobs.some((j) => j.progress < 100 && !j.error);

  async function handle(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).slice(0, multiple ? 20 : 1);
    if (!files.length) return;
    const valid: File[] = [];
    for (const f of files) {
      const problem = validateImage(f);
      if (problem) toast.error(problem);
      else valid.push(f);
    }
    if (!valid.length) return;

    const created = valid.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      preview: URL.createObjectURL(f),
      progress: 0,
    }));
    setJobs((prev) => [...prev, ...created]);

    const results = await Promise.all(
      valid.map(async (file, i) => {
        const job = created[i]!;
        try {
          const url = await uploadImage(bucket, file, folder, (p) =>
            setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, progress: p } : j))),
          );
          return url;
        } catch (e) {
          const message = e instanceof Error ? e.message : "Upload failed";
          toast.error(message);
          setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, error: message } : j)));
          return null;
        }
      }),
    );
    const urls = results.filter((u): u is string => Boolean(u));
    if (urls.length) {
      onUploaded(urls);
      toast.success(urls.length === 1 ? "Image uploaded" : `${urls.length} images uploaded`);
    }
    // Clear finished jobs; keep failed ones visible briefly.
    setJobs((prev) => prev.filter((j) => !created.some((c) => c.id === j.id) || j.error));
    setTimeout(() => {
      setJobs((prev) => prev.filter((j) => !j.error));
      created.forEach((c) => URL.revokeObjectURL(c.preview));
    }, 6000);
  }

  return (
    <div className={className}>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handle(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border text-center text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground",
          compact ? "size-24 p-2" : "p-8",
          dragging && "border-accent bg-accent/5",
        )}
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
        <span>{busy ? "Uploading…" : label}</span>
        {!compact && <span className="text-[0.7rem]">JPG, PNG, WebP, AVIF or GIF · max 10 MB</span>}
        <input
          type="file"
          accept={ACCEPT_ATTR}
          multiple={multiple}
          className="sr-only"
          onChange={(e) => {
            void handle(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {jobs.length > 0 && (
        <ul className="mt-3 space-y-2">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-3 text-xs">
              <img src={j.preview} alt="" className="size-10 shrink-0 object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate">{j.name}</p>
                {j.error ? (
                  <p className="text-destructive">{j.error}</p>
                ) : (
                  <Progress value={j.progress} className="mt-1 h-1" />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function slugify(v: string) {
  return v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Friendlier messages for common Postgres/PostgREST errors. */
export function dbErrorMessage(
  error: { message?: string; code?: string } | null,
  fallback: string,
) {
  if (!error) return fallback;
  if (error.code === "23505" || /duplicate/i.test(error.message ?? ""))
    return "That name, slug or SKU is already in use.";
  if (error.code === "42501" || /permission|policy/i.test(error.message ?? ""))
    return "You don't have permission to do that.";
  if (error.code === "23503") return "This item is still referenced elsewhere.";
  return fallback;
}

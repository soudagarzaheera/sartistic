import { supabase } from "@/integrations/supabase/client";

/** Public Supabase Storage buckets used by the store (see admin migration). */
export const IMAGE_BUCKETS = {
  products: "product-images",
  gallery: "gallery-images",
  homepage: "homepage-banners",
  collections: "collection-images",
} as const;
export type ImageBucket = (typeof IMAGE_BUCKETS)[keyof typeof IMAGE_BUCKETS];

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];
export const ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(",");
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Longest edge after optimisation — plenty for full-width banners. */
const MAX_DIMENSION = 2400;

export function validateImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `${file.name}: use JPG, PNG, WebP, AVIF or GIF.`;
  }
  if (file.size > MAX_IMAGE_BYTES) return `${file.name}: images must be under 10 MB.`;
  return null;
}

/**
 * Downscales very large photos and re-encodes them as WebP in the browser, so
 * phone-camera uploads don't ship multi-megabyte images to customers. GIFs
 * (animation) and files that wouldn't get smaller are uploaded untouched.
 */
export async function optimizeImage(file: File): Promise<File> {
  if (file.type === "image/gif" || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.86),
    );
    if (!blob || blob.type !== "image/webp" || (scale === 1 && blob.size >= file.size)) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  }
}

function extensionFor(file: File) {
  const fromType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
  };
  return fromType[file.type] ?? file.name.split(".").pop()?.toLowerCase() ?? "jpg";
}

/**
 * Uploads an image to a public bucket and returns its permanent public URL.
 * Uses XHR (rather than supabase-js) so upload progress can be reported.
 * Storage policies only allow admins to write to these buckets.
 */
export async function uploadImage(
  bucket: ImageBucket | string,
  original: File,
  folder = "",
  onProgress?: (percent: number) => void,
): Promise<string> {
  const problem = validateImage(original);
  if (problem) throw new Error(problem);
  const file = await optimizeImage(original);

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Your session has expired. Please sign in again.");

  const baseUrl = import.meta.env["VITE_SUPABASE_URL"] as string;
  const apiKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
  const path = `${folder ? `${folder.replace(/^\/+|\/+$/g, "")}/` : ""}${crypto.randomUUID()}.${extensionFor(file)}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${baseUrl}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", apiKey);
    xhr.setRequestHeader("x-upsert", "false");
    // File names are unique, so browsers/CDN may cache them for a year.
    xhr.setRequestHeader("cache-control", "max-age=31536000");
    xhr.setRequestHeader("content-type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else if (xhr.status === 403 || xhr.status === 401) {
        reject(new Error("Upload not allowed — only admins can upload images."));
      } else if (xhr.status === 413) {
        reject(new Error(`${original.name} is too large.`));
      } else {
        reject(new Error(`Upload of ${original.name} failed. Please try again.`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(file);
  });

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Extracts bucket and object path from a Supabase Storage URL (public or signed). */
export function storagePathFromUrl(url: string): { bucket: string; path: string } | null {
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/);
  if (!match) return null;
  return { bucket: match[1]!, path: decodeURIComponent(match[2]!) };
}

/**
 * Deletes the stored file behind a URL. Files bundled with the site
 * (e.g. /images/...) aren't in Storage and are left alone.
 */
export async function deleteImageByUrl(url: string) {
  const ref = storagePathFromUrl(url);
  if (!ref) return false;
  const { error } = await supabase.storage.from(ref.bucket).remove([ref.path]);
  if (error) throw new Error("Couldn't delete the image file.");
  return true;
}

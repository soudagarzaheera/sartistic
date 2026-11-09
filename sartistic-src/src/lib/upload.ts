import { supabase } from "@/integrations/supabase/client";

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

/** Uploads an image to a storage bucket and returns a long-lived signed URL. */
export async function uploadImage(bucket: string, file: File, folder = "") {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Images must be under 10MB.");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${folder ? `${folder}/` : ""}${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error("Upload failed. Please try again.");
  const { data, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, TEN_YEARS);
  if (signError || !data) throw new Error("Upload succeeded but the image link failed.");
  return data.signedUrl;
}

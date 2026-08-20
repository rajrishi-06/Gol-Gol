import { supabase } from "./supabase";

/**
 * Driver KYC documents.
 *
 * The application used to ask for a *link* — with the hint "make sure it's
 * viewable by anyone with the link" — which asked a driver to publish their own
 * licence to the open web and leave it there. Documents now go into a private
 * bucket that only the applicant and an admin can read, and are shown through
 * signed URLs that expire.
 */

const BUCKET = "driver-docs";

/** Ten megabytes, matching the bucket's own limit so we fail before uploading. */
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_DOC_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];

const extensionOf = (file) => {
  const fromName = file.name?.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/.test(fromName)) return fromName;
  return file.type === "application/pdf" ? "pdf" : "jpg";
};

/**
 * Upload one document for `userId`.
 *
 * The object is written to `<userId>/…`, which is what the storage policies key
 * on: the first path segment must equal the caller's own id, so nobody can
 * write into anyone else's folder.
 */
export async function uploadDriverDocument(userId, file) {
  if (!userId) return { path: null, error: new Error("Not signed in.") };
  if (!file) return { path: null, error: new Error("Choose a file first.") };
  if (file.size > MAX_DOC_BYTES) {
    return { path: null, error: new Error("That file is larger than 10 MB.") };
  }
  if (file.type && !ACCEPTED_DOC_TYPES.includes(file.type)) {
    return { path: null, error: new Error("Upload a photo or a PDF.") };
  }

  const path = `${userId}/licence-${Date.now()}.${extensionOf(file)}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type || undefined });
  if (error) return { path: null, error };
  return { path, error: null };
}

/**
 * A link an admin (or the owner) can open, good for a few minutes.
 *
 * Deliberately short-lived and generated on demand: a permanent URL sitting in
 * a table is the thing this feature exists to remove.
 */
export async function signedDocumentUrl(path, expiresInSeconds = 300) {
  if (!path) return { url: null, error: null };
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  return { url: data?.signedUrl ?? null, error };
}

/** Remove a document the applicant replaced or withdrew. */
export async function removeDriverDocument(path) {
  if (!path) return { error: null };
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return { error };
}

// ---------------------------------------------------------------------------
// Mulligan photo storage (Supabase Storage).
//
// Binaries live in the `rw-media` bucket; activity rows in `rw_kv` carry only
// `{ path, mime }`. Run once in the Supabase SQL editor:
//
//   insert into storage.buckets (id, name, public)
//   values ('rw-media', 'rw-media', true)
//   on conflict (id) do update set public = true;
//
//   create policy "rw-media read"  on storage.objects for select using (bucket_id = 'rw-media');
//   create policy "rw-media write" on storage.objects for insert with check (bucket_id = 'rw-media');
//   create policy "rw-media update" on storage.objects for update using (bucket_id = 'rw-media');
//   create policy "rw-media delete" on storage.objects for delete using (bucket_id = 'rw-media');
// ---------------------------------------------------------------------------

import { getSupabaseClient } from "./client";
import { supabaseConfig } from "./supabaseConfig";

export const MEDIA_BUCKET = "rw-media";
export const MEDIA_PREFIX = "rw/";
const MEDIA_PENDING_KEY = "red-walleye-media-pending-v1";
const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.82;
const MAX_BYTES = 2 * 1024 * 1024;

// Shared with the sync layer so the app runs a single Supabase client.
const getClient = getSupabaseClient;

/** Object path for a mulligan activity event's JPEG. */
export function mediaPathForEvent(eventId: string): string {
  return `${MEDIA_PREFIX}${eventId}.jpg`;
}

/** Public URL when the bucket is public-read. */
export function publicMediaUrl(path: string): string | null {
  if (!supabaseConfig) return null;
  return `${supabaseConfig.url}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

/** Local-only mode: in-memory object URLs keyed by storage path. */
const localObjectUrls = new Map<string, string>();

export function storeLocalMedia(path: string, blob: Blob): string {
  const prev = localObjectUrls.get(path);
  if (prev) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(blob);
  localObjectUrls.set(path, url);
  return url;
}

export function clearLocalMedia(): void {
  for (const url of localObjectUrls.values()) URL.revokeObjectURL(url);
  localObjectUrls.clear();
}

/** Resolve a path to a displayable URL (local object URL or Supabase public URL). */
export function resolveMediaUrl(path: string): string | null {
  return localObjectUrls.get(path) ?? publicMediaUrl(path);
}

/** Resize and compress a camera photo for course LTE uploads. */
export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let quality = JPEG_QUALITY;
  let blob = await canvasToJpeg(canvas, quality);
  while (blob.size > MAX_BYTES && quality > 0.45) {
    quality -= 0.08;
    blob = await canvasToJpeg(canvas, quality);
  }
  return blob;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("JPEG encode failed"))),
      "image/jpeg",
      quality,
    );
  });
}

export async function uploadMedia(path: string, blob: Blob): Promise<void> {
  const supabase = getClient();
  if (!supabase) {
    storeLocalMedia(path, blob);
    return;
  }
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
}

export async function deleteMedia(path: string): Promise<void> {
  const local = localObjectUrls.get(path);
  if (local) {
    URL.revokeObjectURL(local);
    localObjectUrls.delete(path);
  }
  const supabase = getClient();
  if (!supabase) return;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
  if (error) console.warn("[rw-media] delete failed:", error.message);
}

/** Wipe every object under `rw/` — mirrors `rw_kv` reset. */
export async function deleteAllTripMedia(): Promise<void> {
  clearLocalMedia();
  saveMediaPending([]);
  const supabase = getClient();
  if (!supabase) return;
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(MEDIA_PREFIX, {
    limit: 500,
  });
  if (error) {
    console.warn("[rw-media] list for reset failed:", error.message);
    return;
  }
  if (!data?.length) return;
  const paths = data.map((f) => `${MEDIA_PREFIX}${f.name}`);
  const { error: delErr } = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
  if (delErr) console.warn("[rw-media] reset delete failed:", delErr.message);
}

// --- Offline upload queue (base64 blobs in localStorage) ---------------------

interface MediaPendingOp {
  path: string;
  /** base64 payload */
  data: string;
}

function loadMediaPending(): MediaPendingOp[] {
  try {
    return JSON.parse(localStorage.getItem(MEDIA_PENDING_KEY) ?? "[]") as MediaPendingOp[];
  } catch {
    return [];
  }
}

function saveMediaPending(ops: MediaPendingOp[]): void {
  try {
    localStorage.setItem(MEDIA_PENDING_KEY, JSON.stringify(ops));
  } catch {
    /* storage full — upload will retry when online */
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(data: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}

let mediaFlushing = false;
let mediaFlushTimer: ReturnType<typeof setInterval> | null = null;

/** Queue a photo for upload when offline; `onSuccess` runs after the blob lands. */
export async function queueMediaUpload(
  path: string,
  blob: Blob,
  onSuccess?: () => void,
): Promise<void> {
  const supabase = getClient();
  if (!supabase) {
    storeLocalMedia(path, blob);
    onSuccess?.();
    return;
  }
  try {
    await uploadMedia(path, blob);
    onSuccess?.();
    return;
  } catch {
  }
  const data = await blobToBase64(blob);
  const ops = loadMediaPending().filter((o) => o.path !== path);
  ops.push({ path, data });
  saveMediaPending(ops);
  void flushMediaQueue(onSuccess, path);
}

export async function flushMediaQueue(
  onSuccess?: () => void,
  onlyPath?: string,
): Promise<void> {
  const supabase = getClient();
  if (!supabase || mediaFlushing) return;
  mediaFlushing = true;
  try {
    let ops = loadMediaPending();
    while (ops.length > 0) {
      const op = onlyPath ? ops.find((o) => o.path === onlyPath) : ops[0];
      if (!op) break;
      try {
        await uploadMedia(op.path, base64ToBlob(op.data));
        ops = loadMediaPending().filter((o) => o.path !== op.path);
        saveMediaPending(ops);
        if (op.path === onlyPath) onSuccess?.();
      } catch {
        break;
      }
    }
  } finally {
    mediaFlushing = false;
  }
}

/** Retry queued uploads on reconnect (called from sync subscribe). */
export function startMediaFlushLoop(): () => void {
  const onOnline = () => void flushMediaQueue();
  window.addEventListener("online", onOnline);
  mediaFlushTimer = setInterval(() => {
    if (loadMediaPending().length > 0) void flushMediaQueue();
  }, 15000);
  void flushMediaQueue();
  return () => {
    window.removeEventListener("online", onOnline);
    if (mediaFlushTimer) clearInterval(mediaFlushTimer);
    mediaFlushTimer = null;
  };
}

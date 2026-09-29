"use client";

import { completeUpload, requestUpload, type UploadRequest } from "./actions";

export type UploadStage = "compressing" | "preparing" | "uploading" | "confirming";

/** Shrinks a phone photo (often 4–8 MB) to a sensible evidence size before it travels. Falls back to the original. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  // HEIC and tiny files aren't worth re-encoding (and most browsers can't decode HEIC into a canvas).
  if (file.size < 350_000 || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

/** PUTs bytes to wherever the server said (our own route or a signed object-store URL), reporting progress. */
function put(target: { url: string; headers: Record<string, string> }, body: Blob, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", target.url);
    for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError(`The upload was refused (${xhr.status}).`, xhr.status >= 500)));
    xhr.onerror = () => reject(new UploadError("Connection lost.", true));
    xhr.ontimeout = () => reject(new UploadError("The connection timed out.", true));
    xhr.timeout = 120_000;
    xhr.send(body);
  });
}

export class UploadError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

/**
 * The whole pipeline for one file: authorise → send → confirm. Returns the confirmed file's id, ready
 * to be attached to whatever it is for. Every step reports where it is, so the person always knows.
 */
export async function uploadFile(input: { purpose: "evidence" | "quote_attachment"; subjectId: string; file: File; onStage: (s: UploadStage) => void; onProgress: (fraction: number) => void }): Promise<string> {
  const { purpose, subjectId, file, onStage, onProgress } = input;
  onStage("preparing");
  const req: UploadRequest = await requestUpload({ purpose, subjectId, name: file.name || "upload", contentType: file.type, sizeBytes: file.size });
  if (!req.ok) throw new UploadError(req.error, false);
  onStage("uploading");
  await put(req.upload, file, onProgress);
  onStage("confirming");
  const done = await completeUpload(req.fileId);
  if (!done.ok) throw new UploadError(done.error ?? "The file couldn't be confirmed.", true);
  return req.fileId;
}

/** Runs `fn`, retrying temporary failures with growing pauses; permanent ones (refused, too big) fail at once. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, onRetry: (attempt: number) => void, delays = [1000, 3000, 8000]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      const retryable = !(error instanceof UploadError) || error.retryable;
      if (!retryable || attempt >= delays.length) throw error;
      onRetry(attempt + 1);
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}

export const newOpId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

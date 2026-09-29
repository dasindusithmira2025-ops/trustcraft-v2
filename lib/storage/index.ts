import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { presign } from "./sigv4";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export const ATTACHMENT_TYPES = [...IMAGE_TYPES, "application/pdf"] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type UploadTarget = { method: "PUT"; url: string; headers: Record<string, string> };
export type Served = { kind: "bytes"; data: Buffer } | { kind: "redirect"; url: string };

/**
 * Where uploaded files live. One interface, two implementations: local disk for development and a
 * self-hosted single server, and any S3-compatible object store (S3, R2, MinIO…) for production.
 * Callers only ever see opaque keys and these five operations — storage credentials never leave the server.
 */
export interface StorageAdapter {
  readonly driver: "local" | "s3";
  /** How the client should send the bytes for `fileId`. Direct-to-store for S3; via our authorized route locally. */
  createUpload(input: { key: string; fileId: string; contentType: string }): Promise<UploadTarget>;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Size of the stored object, or null when it isn't there. */
  head(key: string): Promise<{ sizeBytes: number } | null>;
  /** An authorized download: bytes we hold, or a short-lived signed redirect. */
  serve(key: string, contentType: string): Promise<Served | null>;
  remove(key: string): Promise<void>;
}

export const newKey = () => randomUUID();
// Keys are UUIDs we minted; anything else is refused before it can reach a filesystem path or bucket.
const validKey = (key: string) => /^[0-9a-f-]{36}$/.test(key);

class LocalStorage implements StorageAdapter {
  readonly driver = "local" as const;
  private root = process.env.UPLOADS_DIR ?? path.join(process.cwd(), ".data", "uploads");
  private file(key: string) {
    if (!validKey(key)) throw new Error("Invalid storage key");
    return path.join(/*turbopackIgnore: true*/ this.root, key);
  }
  async createUpload({ fileId }: { key: string; fileId: string; contentType: string }): Promise<UploadTarget> {
    return { method: "PUT", url: `/api/uploads/${fileId}`, headers: {} };
  }
  async put(key: string, data: Buffer) {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.file(key), data);
  }
  async head(key: string) {
    try {
      return { sizeBytes: (await stat(this.file(key))).size };
    } catch {
      return null;
    }
  }
  async serve(key: string): Promise<Served | null> {
    try {
      return { kind: "bytes", data: await readFile(this.file(key)) };
    } catch {
      return null;
    }
  }
  async remove(key: string) {
    await rm(this.file(key), { force: true });
  }
}

class S3Storage implements StorageAdapter {
  readonly driver = "s3" as const;
  private cfg = {
    endpoint: process.env.S3_ENDPOINT, // e.g. https://<account>.r2.cloudflarestorage.com — omit for AWS
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET ?? "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  };
  private target(key: string, method: "GET" | "PUT" | "HEAD" | "DELETE", expiresSeconds: number, headers?: Record<string, string>) {
    if (!validKey(key)) throw new Error("Invalid storage key");
    const { endpoint, region, bucket, accessKeyId, secretAccessKey } = this.cfg;
    // Custom endpoints (R2, MinIO) are path-style; AWS proper is virtual-hosted style.
    const url = endpoint ? new URL(endpoint) : new URL(`https://${bucket}.s3.${region}.amazonaws.com`);
    return presign({ method, host: url.host, path: endpoint ? `/${bucket}/${key}` : `/${key}`, region, accessKeyId, secretAccessKey, expiresSeconds, headers, protocol: url.protocol === "http:" ? "http" : "https" });
  }
  async createUpload({ key, contentType }: { key: string; fileId: string; contentType: string }): Promise<UploadTarget> {
    // Five minutes to start the upload; the content type is part of the signature, so it can't be swapped.
    return { method: "PUT", url: this.target(key, "PUT", 300, { "content-type": contentType }), headers: { "content-type": contentType } };
  }
  async put(key: string, data: Buffer, contentType: string) {
    const res = await fetch(this.target(key, "PUT", 60, { "content-type": contentType }), { method: "PUT", headers: { "content-type": contentType }, body: new Uint8Array(data) });
    if (!res.ok) throw new Error(`Object store rejected the upload (${res.status})`);
  }
  async head(key: string) {
    const res = await fetch(this.target(key, "HEAD", 60), { method: "HEAD" });
    return res.ok ? { sizeBytes: Number(res.headers.get("content-length") ?? 0) } : null;
  }
  async serve(key: string): Promise<Served | null> {
    return { kind: "redirect", url: this.target(key, "GET", 120) };
  }
  async remove(key: string) {
    await fetch(this.target(key, "DELETE", 60), { method: "DELETE" });
  }
}

const g = globalThis as unknown as { __tcStorage?: StorageAdapter };

/** Development and single-server installs use disk; set STORAGE_DRIVER=s3 (plus S3_* variables) for object storage. */
export function getStorage(): StorageAdapter {
  g.__tcStorage ??= process.env.STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage();
  return g.__tcStorage;
}

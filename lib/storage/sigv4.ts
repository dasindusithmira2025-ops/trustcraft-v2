import { createHash, createHmac } from "node:crypto";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();
/** RFC 3986 encoding, the way AWS wants it (encodeURIComponent leaves ! ' ( ) * alone). */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export type PresignInput = {
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  host: string;
  /** Path including the bucket when path-style, e.g. "/bucket/key". Not yet encoded. */
  path: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSeconds: number;
  now?: Date;
  /** Extra headers the caller promises to send (e.g. content-type). They become part of the signature. */
  headers?: Record<string, string>;
  query?: Record<string, string>;
  protocol?: "https" | "http";
};

/**
 * AWS Signature Version 4, query-string ("presigned URL") form, for S3 and S3-compatible stores.
 * Written out (about forty lines of crypto) rather than pulling in an SDK: the app only ever signs
 * three things — upload, download and head. Verified against AWS's published example in sigv4.test.ts.
 */
export function presign(i: PresignInput): string {
  const now = i.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${i.region}/s3/aws4_request`;
  const headers: Record<string, string> = { host: i.host, ...Object.fromEntries(Object.entries(i.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()])) };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const query: Record<string, string> = {
    ...i.query,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${i.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(i.expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${enc(k)}=${enc(query[k]!)}`)
    .join("&");
  const canonicalPath = i.path.split("/").map(enc).join("/");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k}:${headers[k]}\n`)
    .join("");
  const canonicalRequest = [i.method, canonicalPath, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${i.secretAccessKey}`, date), i.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return `${i.protocol ?? "https"}://${i.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

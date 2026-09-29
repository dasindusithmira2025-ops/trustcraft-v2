import { expect, it } from "vitest";
import { presign } from "./sigv4";

// The worked example from AWS's "Authenticating Requests: Using Query Parameters" documentation.
it("signs exactly what AWS documents for a presigned GET", () => {
  const url = presign({
    method: "GET",
    host: "examplebucket.s3.amazonaws.com",
    path: "/test.txt",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    expiresSeconds: 86_400,
    now: new Date("2013-05-24T00:00:00Z"),
  });
  expect(url).toContain("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
  expect(url).toContain("X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request");
});

it("binds the headers the uploader promises to send into the signature", () => {
  const base = { method: "PUT", host: "s3.example.test", path: "/bucket/abc", region: "auto", accessKeyId: "k", secretAccessKey: "s", expiresSeconds: 300, now: new Date("2026-09-29T10:00:00Z") } as const;
  const jpeg = presign({ ...base, headers: { "Content-Type": "image/jpeg" } });
  const png = presign({ ...base, headers: { "Content-Type": "image/png" } });
  expect(jpeg).toContain("X-Amz-SignedHeaders=content-type%3Bhost");
  expect(jpeg.split("X-Amz-Signature=")[1]).not.toBe(png.split("X-Amz-Signature=")[1]);
});

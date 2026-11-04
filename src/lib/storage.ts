import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * File storage. Uses S3-compatible storage (AWS S3, MinIO, Cloudflare R2…) when S3_BUCKET is set,
 * otherwise the local UPLOAD_DIR (development only).
 */
const bucket = process.env.S3_BUCKET;
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");

let client: S3Client | null = null;
function s3() {
  client ??= new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: process.env.S3_ACCESS_KEY_ID
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" }
      : undefined,
  });
  return client;
}

export const storageKind = () => (bucket ? "s3" : "local");

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (bucket) {
    await s3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    return;
  }
  const full = localPath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
}

export async function getObject(key: string): Promise<Buffer> {
  if (bucket) {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  return readFile(localPath(key));
}

function localPath(key: string) {
  const full = path.resolve(UPLOAD_DIR, key);
  if (!full.startsWith(UPLOAD_DIR + path.sep)) throw new Error("Invalid storage key");
  return full;
}

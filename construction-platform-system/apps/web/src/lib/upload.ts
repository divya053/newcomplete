import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Local-disk upload storage for dev. Returns a stable fileKey (relative path). In
 * prod this is the seam to swap for S3/MinIO (env: S3_*) — same signature, the
 * domain only ever holds the opaque key.
 */
const UPLOAD_ROOT = join(process.cwd(), "var", "uploads");

export async function saveUpload(orgId: string, filename: string, buffer: Buffer): Promise<string> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120);
  const dir = join(UPLOAD_ROOT, orgId);
  await mkdir(dir, { recursive: true });
  const key = `${orgId}/${randomUUID()}-${safe}`;
  await writeFile(join(UPLOAD_ROOT, key), buffer);
  return key;
}

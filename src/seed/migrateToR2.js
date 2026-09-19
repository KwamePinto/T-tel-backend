/**
 * Uploads everything under UPLOAD_DIR to the configured S3/R2 bucket.
 *
 *   node src/seed/migrateToR2.js [--dry] [--concurrency 6] [--only documents]
 *
 * Run it once with STORAGE_DRIVER still set to "local" and the S3_* values
 * filled in: it reads from disk and writes to the bucket without changing how
 * the site currently serves anything. Flip STORAGE_DRIVER to "s3" afterwards.
 *
 * Nothing in the database changes. Media.key is already the path inside the
 * bucket and Media.url is already relative, so the same records work for both
 * drivers — which also means you can switch back by flipping the variable.
 *
 * Safe to re-run: an object whose size already matches is skipped, so an
 * interrupted migration resumes rather than starting over.
 */
import fs from "node:fs";
import path from "node:path";
import { env, ROOT } from "../config/env.js";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const DRY = args.includes("--dry");
const CONCURRENCY = Math.max(1, Number(flag("concurrency", 6)));
const ONLY = flag("only", "");

const UPLOADS = path.resolve(ROOT, env.uploadDir || "uploads");

for (const key of ["endpoint", "bucket", "accessKeyId", "secretAccessKey"]) {
  if (!env.s3[key]) {
    console.error(`Missing S3 configuration: ${key}. Fill in the S3_* values in .env first.`);
    process.exit(1);
  }
}

const { S3Client, HeadObjectCommand } = await import("@aws-sdk/client-s3");
const { Upload } = await import("@aws-sdk/lib-storage");

const client = new S3Client({
  region: env.s3.region || "auto",
  endpoint: env.s3.endpoint,
  credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
  forcePathStyle: true,
});

const MIME = {
  ".pdf": "application/pdf", ".webp": "image/webp", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm",
  ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".zip": "application/zip", ".csv": "text/csv",
};

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name !== ".gitkeep") out.push(p);
  }
  return out;
}

const files = walk(ONLY ? path.join(UPLOADS, ONLY) : UPLOADS);
const totalBytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);

console.log(`[r2] bucket   ${env.s3.bucket}`);
console.log(`[r2] endpoint ${env.s3.endpoint}`);
console.log(`[r2] ${files.length} file(s), ${(totalBytes / 1024 / 1024 / 1024).toFixed(2)}GB${DRY ? "  [dry run]" : ""}\n`);

const stats = { uploaded: 0, skipped: 0, failed: 0, bytes: 0 };
const failures = [];

/** Already there at the same size? Then a re-run has nothing to do. */
async function alreadyUploaded(key, size) {
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    return head.ContentLength === size;
  } catch {
    return false;
  }
}

async function upload(file) {
  const key = path.relative(UPLOADS, file).split(path.sep).join("/");
  const size = fs.statSync(file).size;

  if (await alreadyUploaded(key, size)) {
    stats.skipped++;
    return;
  }
  if (DRY) {
    stats.uploaded++;
    stats.bytes += size;
    return;
  }

  try {
    await new Upload({
      client,
      params: {
        Bucket: env.s3.bucket,
        Key: key,
        Body: fs.createReadStream(file),
        ContentType: MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        CacheControl: "public, max-age=2592000",
      },
      queueSize: 4,           // parts in flight for one large file
      partSize: 8 * 1024 * 1024,
    }).done();

    stats.uploaded++;
    stats.bytes += size;
  } catch (err) {
    stats.failed++;
    failures.push(`${key}: ${err.message.slice(0, 90)}`);
  }
}

// a small worker pool: a few hundred megabyte PDFs benefit from overlap,
// but not from all 800 files starting at once
const queue = [...files];
let done = 0;
async function worker() {
  while (queue.length) {
    const file = queue.shift();
    await upload(file);
    done++;
    if (done % 25 === 0 || done === files.length) {
      const pct = ((done / files.length) * 100).toFixed(0);
      console.log(`   ${String(done).padStart(4)}/${files.length}  ${pct}%  ` +
        `(${(stats.bytes / 1024 / 1024 / 1024).toFixed(2)}GB sent, ${stats.skipped} already there)`);
    }
  }
}

const started = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const mins = ((Date.now() - started) / 60000).toFixed(1);

console.log(`\n[r2] done in ${mins} min`);
console.log(`   uploaded: ${stats.uploaded}  (${(stats.bytes / 1024 / 1024 / 1024).toFixed(2)}GB)`);
console.log(`   skipped:  ${stats.skipped}   (already in the bucket)`);
console.log(`   failed:   ${stats.failed}`);
failures.slice(0, 10).forEach((f) => console.log(`      ${f}`));

if (!stats.failed) {
  console.log("\nNext: set STORAGE_DRIVER=s3 and S3_PUBLIC_BASE_URL, then restart the API.");
}
process.exit(stats.failed ? 1 : 0);

/**
 * Copies every object from one Cloudflare R2 (or any S3-compatible) bucket
 * to another — developer's bucket to the client's bucket.
 *
 *   node handover/migrate-r2-bucket.mjs --dry     list what would copy
 *   node handover/migrate-r2-bucket.mjs           copy for real
 *
 * Reads its configuration from handover/.env (see handover/.env.example),
 * not the application's own .env — the two buckets belong to two different
 * Cloudflare accounts with two different credential sets, so this needs its
 * own SOURCE_S3_* / DEST_S3_* pair rather than the app's single S3_*.
 *
 * The source and destination are different accounts, so a server-side copy
 * (S3's CopyObject) cannot be used — neither account's credentials can reach
 * the other's bucket. Every object is instead streamed through this machine:
 * downloaded from source, re-uploaded to destination. Expect this to take a
 * while and to use as much bandwidth as the bucket is large; run it somewhere
 * with a stable connection.
 *
 * Safe to re-run: an object already at the destination with a matching size
 * is skipped, so an interrupted run resumes rather than starting over. This
 * is a size check, not a byte-for-byte checksum — good enough to resume a
 * dropped connection, not a substitute for verifying the result (see the
 * "Verify" step in handover/README.md).
 *
 * Nothing on the source is modified or deleted.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { S3Client, ListObjectsV2Command, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

// this script's own handover/.env, not the app's — loaded by absolute path
// so the script runs the same whichever directory it's launched from
const HERE = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(HERE, ".env") });

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const DRY = args.includes("--dry");
const CONCURRENCY = Math.max(1, Number(flag("concurrency", 6)));
const PREFIX = flag("prefix", ""); // limit to one folder, e.g. --prefix uploads/documents

function need(key) {
  const value = process.env[key];
  if (!value) {
    console.error(`Missing ${key}. Copy handover/.env.example to handover/.env and fill it in.`);
    process.exit(1);
  }
  return value;
}

const source = {
  endpoint: need("SOURCE_S3_ENDPOINT"),
  region: process.env.SOURCE_S3_REGION || "auto",
  bucket: need("SOURCE_S3_BUCKET"),
  accessKeyId: need("SOURCE_S3_ACCESS_KEY_ID"),
  secretAccessKey: need("SOURCE_S3_SECRET_ACCESS_KEY"),
};
const dest = {
  endpoint: need("DEST_S3_ENDPOINT"),
  region: process.env.DEST_S3_REGION || "auto",
  bucket: need("DEST_S3_BUCKET"),
  accessKeyId: need("DEST_S3_ACCESS_KEY_ID"),
  secretAccessKey: need("DEST_S3_SECRET_ACCESS_KEY"),
};

if (source.endpoint === dest.endpoint && source.bucket === dest.bucket) {
  console.error("Source and destination are the same bucket — refusing to run.");
  process.exit(1);
}

const client = (cfg) =>
  new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: true,
  });

const srcClient = client(source);
const dstClient = client(dest);

/** Every key in the source bucket, paginated — ListObjectsV2 caps at 1000 per page. */
async function listAll() {
  const keys = [];
  let token;
  do {
    const page = await srcClient.send(
      new ListObjectsV2Command({
        Bucket: source.bucket,
        Prefix: PREFIX || undefined,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents || []) keys.push({ key: obj.Key, size: obj.Size });
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function alreadyThere(key, size) {
  try {
    const head = await dstClient.send(new HeadObjectCommand({ Bucket: dest.bucket, Key: key }));
    return head.ContentLength === size;
  } catch {
    return false;
  }
}

const stats = { copied: 0, skipped: 0, failed: 0, bytes: 0 };
const failures = [];

async function copyOne({ key, size }) {
  if (await alreadyThere(key, size)) {
    stats.skipped++;
    return;
  }
  if (DRY) {
    stats.copied++;
    stats.bytes += size;
    return;
  }

  try {
    // the response body is a readable stream, piped straight into the
    // upload rather than buffered — some of these PDFs are tens of megabytes
    const got = await srcClient.send(new GetObjectCommand({ Bucket: source.bucket, Key: key }));

    await new Upload({
      client: dstClient,
      params: {
        Bucket: dest.bucket,
        Key: key,
        Body: got.Body,
        ContentType: got.ContentType || "application/octet-stream",
        CacheControl: got.CacheControl || "public, max-age=2592000",
      },
      queueSize: 4,
      partSize: 8 * 1024 * 1024,
    }).done();

    stats.copied++;
    stats.bytes += size;
  } catch (err) {
    stats.failed++;
    failures.push(`${key}: ${err.message.slice(0, 100)}`);
  }
}

async function main() {
  console.log(`[r2->r2] source      ${source.bucket}  (${source.endpoint})`);
  console.log(`[r2->r2] destination ${dest.bucket}  (${dest.endpoint})`);

  const objects = await listAll();
  const totalBytes = objects.reduce((n, o) => n + o.size, 0);
  console.log(
    `[r2->r2] ${objects.length} object(s), ${(totalBytes / 1024 / 1024 / 1024).toFixed(2)}GB` +
      `${PREFIX ? `  (prefix: ${PREFIX})` : ""}${DRY ? "  [dry run]" : ""}\n`,
  );

  const queue = [...objects];
  let done = 0;
  async function worker() {
    while (queue.length) {
      const obj = queue.shift();
      await copyOne(obj);
      done++;
      if (done % 25 === 0 || done === objects.length) {
        const pct = ((done / objects.length) * 100).toFixed(0);
        console.log(
          `   ${String(done).padStart(4)}/${objects.length}  ${pct}%  ` +
            `(${(stats.bytes / 1024 / 1024 / 1024).toFixed(2)}GB sent, ${stats.skipped} already there)`,
        );
      }
    }
  }

  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const mins = ((Date.now() - started) / 60000).toFixed(1);

  console.log(`\n[r2->r2] done in ${mins} min`);
  console.log(`   copied:  ${stats.copied}  (${(stats.bytes / 1024 / 1024 / 1024).toFixed(2)}GB)`);
  console.log(`   skipped: ${stats.skipped}  (already at the destination)`);
  console.log(`   failed:  ${stats.failed}`);
  failures.slice(0, 10).forEach((f) => console.log(`      ${f}`));

  if (!stats.failed && !DRY) {
    console.log(
      "\nNext: point the client's backend .env at the destination bucket " +
        "(S3_* values) and confirm the site loads its images/PDFs from there.",
    );
  }
  process.exit(stats.failed ? 1 : 0);
}

main().catch((err) => {
  console.error("\n[r2->r2] failed:", err);
  process.exit(1);
});

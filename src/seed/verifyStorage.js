/**
 * Checks that the R2 bucket really holds everything the site needs.
 *
 *   node src/seed/verifyStorage.js          # bucket vs disk vs database
 *   node src/seed/verifyStorage.js --reach  # also HEAD every object publicly
 *
 * Three lists have to line up for the site to render:
 *
 *   disk     uploads/** on this machine, the source the migration read from
 *   bucket   what is actually in R2
 *   database Media records, whose `key` is the path inside the bucket
 *
 * Media records whose url starts with /images/ are deliberately absent from
 * the bucket: those are static files committed to the frontend repo and served
 * by the frontend, not by this API. They are reported separately rather than
 * as failures.
 *
 * --reach is the slower, stronger check: it fetches every object over the
 * public R2 URL a browser would use and compares content-length. That catches
 * a bucket whose public access was never switched on, which a bucket listing
 * alone cannot tell you.
 */
import fs from "node:fs";
import path from "node:path";
import { env, ROOT } from "../config/env.js";
import { connectDb, disconnectDb } from "../config/db.js";
import { Media } from "../models/Media.js";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const REACH = process.argv.includes("--reach");

for (const key of ["endpoint", "bucket", "accessKeyId", "secretAccessKey"]) {
  if (!env.s3[key]) {
    console.error(`Missing S3 configuration: ${key}. Fill in the S3_* values in .env first.`);
    process.exit(1);
  }
}

const client = new S3Client({
  region: env.s3.region || "auto",
  endpoint: env.s3.endpoint,
  credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
  forcePathStyle: true,
});

/** Every object in the bucket, keyed to its size. Listing is paginated at 1000. */
async function listBucket() {
  const out = new Map();
  let token;
  do {
    const r = await client.send(
      new ListObjectsV2Command({ Bucket: env.s3.bucket, ContinuationToken: token })
    );
    for (const o of r.Contents || []) out.set(o.Key, o.Size);
    token = r.NextContinuationToken;
  } while (token);
  return out;
}

function listDisk(dir, base = dir, out = new Map()) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) listDisk(p, base, out);
    else if (entry.name !== ".gitkeep") {
      out.set(path.relative(base, p).split(path.sep).join("/"), fs.statSync(p).size);
    }
  }
  return out;
}

const bucket = await listBucket();
const disk = listDisk(path.resolve(ROOT, env.uploadDir || "uploads"));

await connectDb();
const media = await Media.find({}, "key url").lean();
await disconnectDb();

const bucketBytes = [...bucket.values()].reduce((a, b) => a + b, 0);
console.log(`bucket   : ${bucket.size} objects, ${(bucketBytes / 1024 ** 3).toFixed(2)}GB`);
console.log(`disk     : ${disk.size} files`);
console.log(`database : ${media.length} media records\n`);

const missing = [...disk.keys()].filter((k) => !bucket.has(k));
const mismatched = [...disk.entries()].filter(([k, s]) => bucket.has(k) && bucket.get(k) !== s);

// a record served by this API has a /uploads/ url, so its key must be an object
const uploads = media.filter((m) => (m.url || "").startsWith("/uploads/"));
const statics = media.filter((m) => (m.url || "").startsWith("/images/"));
const stray = media.filter((m) => !uploads.includes(m) && !statics.includes(m));
const dangling = uploads.filter((m) => !m.key || !bucket.has(m.key));

const report = (label, n, rows = []) => {
  console.log(`${label.padEnd(34)} ${n}`);
  rows.slice(0, 10).forEach((r) => console.log("     ", r));
};

report("disk files not in the bucket", missing.length, missing);
report("size mismatches", mismatched.length, mismatched.map(([k, s]) => `${k}  disk ${s} vs bucket ${bucket.get(k)}`));
report("media records with no object", dangling.length, dangling.map((m) => m.key || `(no key) ${m.url}`));
report("records served by the frontend", statics.length);
report("records on neither path", stray.length, stray.map((m) => m.url));

let unreachable = [];
if (REACH) {
  if (!env.s3.publicBaseUrl) {
    console.log("\n--reach skipped: S3_PUBLIC_BASE_URL is not set.");
  } else {
    const base = env.s3.publicBaseUrl.replace(/\/+$/, "");
    const queue = [...bucket.entries()];
    const total = queue.length;
    let done = 0;

    // twelve at a time: enough to finish 800-odd HEADs quickly without
    // Cloudflare treating the sweep as a flood
    await Promise.all(Array.from({ length: 12 }, async () => {
      while (queue.length) {
        const [key, size] = queue.shift();
        const url = `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
        try {
          const r = await fetch(url, { method: "HEAD" });
          const len = Number(r.headers.get("content-length") || 0);
          if (!r.ok) unreachable.push(`${r.status}  ${key}`);
          else if (len !== size) unreachable.push(`served ${len} bytes, expected ${size}  ${key}`);
        } catch (err) {
          unreachable.push(`${err.message.slice(0, 40)}  ${key}`);
        }
        if (++done % 150 === 0) console.log(`   reached ${done}/${total}`);
      }
    }));
    console.log();
    report("objects not publicly reachable", unreachable.length, unreachable);
  }
}

const problems = missing.length + mismatched.length + dangling.length + stray.length + unreachable.length;
console.log(problems ? `\n${problems} problem(s) found.` : "\nEverything lines up.");
process.exit(problems ? 1 : 0);

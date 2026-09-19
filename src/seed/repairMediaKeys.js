/**
 * Repoints Media records whose file was renamed underneath them.
 *
 *   node src/seed/repairMediaKeys.js [--dry]
 *
 * A document can be filed under more than one collection, so several Media
 * records can describe the same file on disk. shortenUploadNames.js renamed
 * the file for the first record it saw; the others then found nothing at the
 * old path, were counted as "missing" and kept their stale key — which resolves
 * to a 404 for that cover.
 *
 * This walks every record whose file is absent, works out the shortened name
 * it should now have, and repoints it.
 */
import fs from "node:fs";
import path from "node:path";
import { env, ROOT } from "../config/env.js";
import { connectDb, disconnectDb } from "../config/db.js";
import { Media } from "../models/index.js";

const DRY = process.argv.includes("--dry");
const UPLOADS = path.resolve(ROOT, env.uploadDir || "uploads");
const KEEP = 30; // must match shortenUploadNames.js

function shorten(filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const m = base.match(/^([0-9a-f]{10})-(.*)$/i);
  if (!m) return null;
  const [, hash, tail] = m;
  const slug = tail.replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, KEEP);
  return `${hash}${slug ? `-${slug}` : ""}${ext}`;
}

await connectDb();

const all = await Media.find({ deletedAt: null }).select("key url filename").lean();
let fixed = 0;
let stillMissing = 0;
const unresolved = [];

for (const m of all) {
  if (!m.key?.startsWith("documents/") && !m.key?.startsWith("thumbnails/")) continue;
  if (fs.existsSync(path.join(UPLOADS, m.key))) continue; // already correct

  const dir = path.dirname(m.key);
  const shortName = shorten(path.basename(m.key));
  const candidate = shortName ? path.posix.join(dir, shortName) : null;

  if (candidate && fs.existsSync(path.join(UPLOADS, candidate))) {
    if (!DRY) {
      await Media.updateOne(
        { _id: m._id },
        { $set: { key: candidate, filename: shortName, url: `/uploads/${candidate}` } },
      );
    }
    fixed++;
    if (fixed <= 5) console.log(`  ${path.basename(m.key)}\n      -> ${shortName}`);
  } else {
    stillMissing++;
    if (unresolved.length < 5) unresolved.push(m.key);
  }
}

console.log(`\n${DRY ? "[dry] " : ""}${fixed} record(s) repointed`);
if (stillMissing) {
  console.log(`${stillMissing} record(s) still have no file on disk:`);
  unresolved.forEach((k) => console.log(`   ${k}`));
}

await disconnectDb();

/**
 * Re-reads every Media file from disk and corrects its stored size.
 *
 *   node src/seed/syncMediaSizes.js [--dry]
 *
 * The compression pass rewrites PDFs in place, which leaves Media.size holding
 * the pre-compression figure — the Knowledge Hub cards print that number, so it
 * would show sizes nobody actually downloads. Also reports any record whose
 * file has gone missing from storage.
 */
import fs from "node:fs";
import path from "node:path";
import { env, ROOT } from "../config/env.js";
import { connectDb, disconnectDb } from "../config/db.js";
import { Media } from "../models/index.js";

const DRY = process.argv.includes("--dry");
const UPLOADS = path.resolve(ROOT, env.uploadDir || "uploads");

await connectDb();

const all = await Media.find({ deletedAt: null }).select("key size originalName").lean();
let updated = 0;
let missing = 0;
let before = 0;
let after = 0;

for (const m of all) {
  const abs = path.join(UPLOADS, m.key);
  if (!fs.existsSync(abs)) {
    // front-end assets are referenced by path and don't live in uploads
    if (!m.key.startsWith("documents/") && !m.key.startsWith("thumbnails/")) continue;
    missing++;
    console.log(`  ! missing from storage: ${m.key}`);
    continue;
  }
  const size = fs.statSync(abs).size;
  if (size === m.size) continue;
  before += m.size;
  after += size;
  updated++;
  if (!DRY) await Media.updateOne({ _id: m._id }, { $set: { size } });
}

console.log(
  `${DRY ? "[dry] " : ""}${updated} of ${all.length} media record(s) resized` +
  (updated ? `: ${(before / 1024 / 1024 / 1024).toFixed(2)}GB -> ${(after / 1024 / 1024 / 1024).toFixed(2)}GB` : ""),
);
if (missing) console.log(`  ${missing} record(s) point at a file that is not on disk`);

await disconnectDb();

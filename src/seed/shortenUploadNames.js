/**
 * Shortens stored upload filenames and updates the Media records to match.
 *
 *   node src/seed/shortenUploadNames.js [--dry]
 *
 * The ingest named each file "<hash>-<the original filename>", which for the
 * longer course manuals produced paths past Windows' 260-character limit:
 * cloning the repository fails with "Filename too long" and those files are
 * simply absent, so their covers never render.
 *
 * The descriptive part is cut to 30 characters. Nothing user-facing changes —
 * downloads are served under Media.originalName, which is untouched.
 */
import fs from "node:fs";
import path from "node:path";
import { env, ROOT } from "../config/env.js";
import { connectDb, disconnectDb } from "../config/db.js";
import { Media } from "../models/index.js";

const DRY = process.argv.includes("--dry");
const UPLOADS = path.resolve(ROOT, env.uploadDir || "uploads");
const KEEP = 30; // characters of the descriptive tail

/** "a1b2c3d4e5-some very long document name.pdf" -> "a1b2c3d4e5-some-very-long-docum.pdf" */
function shorten(filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const m = base.match(/^([0-9a-f]{10})-(.*)$/i);
  if (!m) return null;

  const [, hash, tail] = m;
  const slug = tail.replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, KEEP);
  const next = `${hash}${slug ? `-${slug}` : ""}${ext}`;
  return next === filename ? null : next;
}

await connectDb();

const all = await Media.find({ deletedAt: null }).select("key url filename originalName").lean();
let renamed = 0;
let missing = 0;
const samples = [];

for (const m of all) {
  if (!m.key?.startsWith("documents/") && !m.key?.startsWith("thumbnails/")) continue;

  const dir = path.dirname(m.key);
  const oldName = path.basename(m.key);
  const newName = shorten(oldName);
  if (!newName) continue;

  const oldAbs = path.join(UPLOADS, m.key);
  const newKey = path.posix.join(dir, newName);
  const newAbs = path.join(UPLOADS, newKey);

  if (!fs.existsSync(oldAbs)) { missing++; continue; }

  if (samples.length < 6) samples.push(`${oldName}\n        -> ${newName}`);

  if (!DRY) {
    fs.renameSync(oldAbs, newAbs);
    await Media.updateOne(
      { _id: m._id },
      { $set: { key: newKey, filename: newName, url: `/uploads/${newKey}` } },
    );
  }
  renamed++;
}

console.log(`${DRY ? "[dry] " : ""}${renamed} of ${all.length} media file(s) shortened`);
if (missing) console.log(`  ${missing} record(s) had no file on disk`);
samples.forEach((s) => console.log("   " + s));

// report the worst remaining path, so we can see we are clear of the limit
const longest = (await Media.find({ deletedAt: null }).select("key").lean())
  .map((m) => m.key || "")
  .sort((a, b) => b.length - a.length)[0] || "";
console.log(`\nlongest key now ${longest.length} chars: ${longest}`);

await disconnectDb();

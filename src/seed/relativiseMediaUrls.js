/**
 * Rewrites absolute media URLs to relative paths.
 *
 *   node src/seed/relativiseMediaUrls.js [--dry]
 *
 * Media saved through the upload service used to store an absolute URL built
 * from PUBLIC_URL. Anything imported on a laptop therefore points at
 * http://localhost:5000 forever, and the browser blocks it as mixed content
 * once the site is served over HTTPS.
 *
 * Storing the path alone makes the record portable: the front end resolves it
 * against VITE_API_URL wherever it happens to be running.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Media } from "../models/index.js";

const DRY = process.argv.includes("--dry");

await connectDb();

const absolute = await Media.find({ url: /^https?:\/\// }).select("url key").lean();
let fixed = 0;

for (const m of absolute) {
  // prefer the stored key; fall back to whatever follows /uploads/ in the URL
  const fromKey = m.key ? `/uploads/${m.key}` : null;
  const fromUrl = (m.url.match(/\/uploads\/.*$/) || [])[0] || null;
  const next = fromKey || fromUrl;
  if (!next) {
    console.log(`  ! cannot derive a path for ${m.url.slice(0, 70)}`);
    continue;
  }
  if (fixed < 4) console.log(`  ${m.url.slice(0, 62)}\n      -> ${next}`);
  if (!DRY) await Media.updateOne({ _id: m._id }, { $set: { url: next } });
  fixed++;
}

console.log(`\n${DRY ? "[dry] " : ""}${fixed} of ${absolute.length} absolute URL(s) made relative`);
await disconnectDb();

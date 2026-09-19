/**
 * Re-encodes stored images so pages load faster.
 *
 *   node src/seed/optimiseMedia.js [--dry] [--prefix images/] [--quality 70]
 *
 * Three things make the difference:
 *
 *   size       an image is capped at the width it is actually displayed at,
 *              doubled for high-density screens — not the width it happened
 *              to be uploaded at
 *   quality    webp at 70 with a higher effort setting is materially smaller
 *              than at 82 and, on photographs, hard to tell apart
 *   dimensions width and height are recorded, so the page can reserve the
 *              right space and stop shifting as pictures arrive
 *
 * Only rewrites a file when the result is actually smaller, so re-running is
 * safe and an already-optimised library reports no change.
 */
import fs from "node:fs";
import path from "node:path";
import { connectDb, disconnectDb } from "../config/db.js";
import { env } from "../config/env.js";
import { Media } from "../models/Media.js";
import { storage, isRemoteStorage } from "../services/storage.js";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const DRY = args.includes("--dry");
const PREFIX = flag("prefix", "images/");
const QUALITY = Number(flag("quality", 70));

// The widest any of these is drawn, doubled for high-density screens. A hero
// spans the window; a split row is half a 1200px column; a figure is the
// column itself.
const MAX_WIDTH = 1500;

await connectDb();

const { default: sharp } = await import("sharp");

const items = await Media.find({
  mime: /^image\//,
  deletedAt: null,
  key: new RegExp(`^${PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  // Only files this API actually stores. Records pointing at /images/ are
  // static assets committed to the front end — they share the key prefix but
  // live in that repo, so there is nothing here to re-encode.
  url: /^\/uploads\//,
}).lean();

console.log(`${items.length} image(s) under "${PREFIX}"${DRY ? "  [dry run]" : ""}\n`);

const stats = { done: 0, skipped: 0, failed: 0, before: 0, after: 0 };

for (const media of items) {
  try {
    // Read from wherever it lives: on remote storage that means fetching the
    // object back, since there is no local copy any more.
    let buf;
    const local = storage().resolve?.(media.key);
    if (!isRemoteStorage() && local && fs.existsSync(local)) {
      buf = fs.readFileSync(local);
    } else {
      const url = env.s3.publicBaseUrl
        ? `${env.s3.publicBaseUrl.replace(/\/+$/, "")}/${media.key}`
        : null;
      if (!url) throw new Error("no way to read the object back");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    }

    const meta = await sharp(buf).metadata();
    const out = await sharp(buf)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      // effort trades encode time for a smaller file; this runs once
      .webp({ quality: QUALITY, effort: 6 })
      .toBuffer();
    const outMeta = await sharp(out).metadata();

    stats.before += media.size;

    // Never replace a file with a bigger one — a small picture re-encoded can
    // come out larger, and then this would be making pages slower.
    if (out.length >= media.size && meta.width <= MAX_WIDTH) {
      stats.after += media.size;
      stats.skipped++;
      if (!DRY && (media.width !== meta.width || media.height !== meta.height)) {
        await Media.updateOne({ _id: media._id }, { $set: { width: meta.width, height: meta.height } });
      }
      console.log(`  keep   ${media.key.split("/").pop().slice(0, 44).padEnd(46)} ${(media.size / 1024).toFixed(0)}KB`);
      continue;
    }

    if (!DRY) {
      const abs = path.join(env.uploadDir, media.key);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, out);
      // save() uploads and clears the staging copy; the key is unchanged, so
      // every record already pointing here keeps working
      await storage().save({ path: abs, mimetype: "image/webp" });
      await Media.updateOne(
        { _id: media._id },
        { $set: { size: out.length, width: outMeta.width, height: outMeta.height, mime: "image/webp" } },
      );
    }

    stats.after += out.length;
    stats.done++;
    console.log(`  shrink ${media.key.split("/").pop().slice(0, 44).padEnd(46)} ` +
      `${(media.size / 1024).toFixed(0).padStart(5)}KB -> ${(out.length / 1024).toFixed(0).padStart(4)}KB  ` +
      `${meta.width}x${meta.height} -> ${outMeta.width}x${outMeta.height}`);
  } catch (err) {
    stats.failed++;
    console.log(`  ! ${media.key}: ${err.message.slice(0, 60)}`);
  }
}

const saved = stats.before - stats.after;
console.log(`\n${DRY ? "[dry run] " : ""}re-encoded ${stats.done}, kept ${stats.skipped}, failed ${stats.failed}`);
console.log(`${(stats.before / 1024 / 1024).toFixed(2)}MB -> ${(stats.after / 1024 / 1024).toFixed(2)}MB` +
  (stats.before ? `  (${((saved / stats.before) * 100).toFixed(0)}% smaller)` : ""));

await disconnectDb();

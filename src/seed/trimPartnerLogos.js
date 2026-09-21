/**
 * Trims the dead space out of partner logos.
 *
 *   node src/seed/trimPartnerLogos.js [--dry]
 *
 * A logo is drawn to fit its mark, so the file is whatever canvas the designer
 * exported on. EdTechHub's artwork is 156×34 inside a 162×128 file — three
 * quarters of it empty — and Prevail Fund's is 254×49 inside 278×110. Anything
 * that lays logos out by their file dimensions therefore gets the shapes
 * wrong: a wide wordmark is treated as a square and drawn at a third of the
 * size of the logo beside it, which is what made the funders carousel look
 * uneven however the row was spaced.
 *
 * This rewrites each file to its own ink and records the new width and height
 * on the media record. The logo itself is not touched — the only thing removed
 * is empty space — and a file that is already tight is left alone, so re-runs
 * cost nothing.
 *
 * The rewritten file is stored under a name carrying a hash of its contents.
 * Uploads are served `public, max-age=2592000`, so a record left pointing at
 * the same URL would keep showing the previous artwork from browser and CDN
 * caches for a month; changing the name is what makes a corrected logo
 * actually appear.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { connectDb, disconnectDb } from "../config/db.js";
import { env } from "../config/env.js";
import { Partner } from "../models/Partner.js";
import { Media } from "../models/Media.js";
import { storage } from "../services/storage.js";

const DRY = process.argv.includes("--dry");

/** The stored file, from disk when the driver keeps it there, else from the bucket. */
async function fetchFile(key) {
  const local = path.join(env.uploadDir, key);
  if (fs.existsSync(local)) return fs.readFileSync(local);

  if (!env.s3.publicBaseUrl) throw new Error("S3_PUBLIC_BASE_URL is not set, so the file cannot be fetched");
  const res = await fetch(`${env.s3.publicBaseUrl.replace(/\/+$/, "")}/${key}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Alpha at or below this counts as empty. Faint enough to keep anti-aliasing. */
const ALPHA_FLOOR = 8;

/**
 * The bounding box of everything that isn't transparent.
 *
 * Done by scanning the alpha channel rather than with sharp's own trim(),
 * whose border detection is not idempotent: running it twice on the same logo
 * took Mastercard Foundation from 156×128 to 138×124 and Jacobs Foundation
 * from 162×90 to 162×72, so a second pass would keep eating into the marks.
 * The box found here is a property of the pixels, so re-running is a no-op.
 */
async function inkBox(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + channels - 1] > ALPHA_FLOOR) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * The logo without its dead space. An image with no alpha channel — a logo
 * flattened onto white — has no transparency to go by, so that one is left to
 * sharp's border trim.
 */
async function tightLogo(buffer) {
  const meta = await sharp(buffer).metadata();
  const box = meta.hasAlpha ? await inkBox(buffer) : null;
  const pipeline = box ? sharp(buffer).extract(box) : sharp(buffer).trim({ threshold: 1 });
  return pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
}

/** `<dir>/<name>-<8 hex of the contents>.png` — stable for the same bytes. */
function contentKey(key, data) {
  const dir = path.posix.dirname(key);
  const name = path.posix.basename(key, path.posix.extname(key)).replace(/-[0-9a-f]{8}$/, "");
  const hash = createHash("sha1").update(data).digest("hex").slice(0, 8);
  return path.posix.join(dir, `${name}-${hash}.png`);
}

await connectDb();

const partners = await Partner.find({ deletedAt: null })
  .populate("logo", "url key width height size")
  .sort("sortOrder name")
  .lean();

const { default: sharp } = await import("sharp");
let rewritten = 0;
let untouched = 0;

for (const partner of partners) {
  const logo = partner.logo;
  if (!logo?.key) {
    console.log(`  ${partner.name.padEnd(50)} no logo, skipped`);
    continue;
  }

  let file;
  try {
    file = await fetchFile(logo.key);
  } catch (err) {
    console.log(`  ! ${partner.name}: ${err.message}`);
    continue;
  }

  const before = await sharp(file).metadata();
  let cut;
  try {
    cut = await tightLogo(file);
  } catch (err) {
    console.log(`  ! ${partner.name}: ${err.message}`);
    continue;
  }

  const { width, height } = cut.info;
  const newKey = contentKey(logo.key, cut.data);
  const ratio = (w, h) => (w / h).toFixed(2);
  const shape = `${before.width}×${before.height} → ${width}×${height} ` +
    `(${ratio(before.width, before.height)} → ${ratio(width, height)})`;

  if (newKey === logo.key && width === logo.width && height === logo.height) {
    untouched++;
    console.log(`  ${partner.name.padEnd(50)} ${shape}  already tight`);
    continue;
  }

  rewritten++;
  console.log(`  ${partner.name.padEnd(50)} ${shape}`);
  if (newKey !== logo.key) console.log(`      ${logo.key} → ${newKey}`);
  if (DRY) continue;

  // staged locally under its new key, so the driver uploads it there
  const abs = path.join(env.uploadDir, newKey);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, cut.data);
  await storage().save({ path: abs, mimetype: "image/png" });

  await Media.updateOne(
    { _id: logo._id },
    { $set: { key: newKey, url: `/uploads/${newKey}`, width, height, size: cut.data.length, mime: "image/png" } },
  );

  // the superseded file was only referenced by this record, which has just
  // moved off it
  if (newKey !== logo.key) {
    try {
      await storage().remove(logo.key);
    } catch (err) {
      console.log(`      (could not remove ${logo.key}: ${err.message})`);
    }
  }
}

console.log(
  `\n${DRY ? "[dry run] " : ""}${rewritten} logo(s) rewritten, ${untouched} already tight and addressed`,
);
await disconnectDb();

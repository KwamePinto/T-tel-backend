/**
 * Replicates the reference site's Our Partners page exactly: its eleven
 * partners, their full descriptions, their own logo images, and its hero.
 *
 *   node src/seed/importPartners.js [--dry]
 *
 * All eleven partners already existed here under shorter or, for every
 * university, entirely empty descriptions, with generic stock logos standing
 * in for the real ones. This replaces both with the reference site's own —
 * matched by name, which is exact across every entry — and drops
 * `isPrincipal`, a spotlight treatment this database had that the reference
 * page does not, so the result matches it rather than sitting between the two.
 *
 * Images are keyed by the URL they came from and resized/re-encoded on the
 * way in, the same as every other import from this reference site — a
 * re-run reuses what's already stored rather than fetching again.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDb, disconnectDb } from "../config/db.js";
import { env } from "../config/env.js";
import { Partner } from "../models/Partner.js";
import { Media } from "../models/Media.js";
import { storage } from "../services/storage.js";

const DRY = process.argv.includes("--dry");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(HERE, "data", "partners.json"), "utf8"));

const GROUP_OF = {
  "Government Partners": "government",
  "Universities": "university",
  "Funding & Project Partners": "funder",
};

const slugify = (s) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

await connectDb();

async function importLogo(url, name) {
  const existing = await Media.findOne({ sourceUrl: url }).lean();
  if (existing) { stats.reused++; return existing; }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const { default: sharp } = await import("sharp");
  // Logos are crests and wordmarks, not photographs — a modest cap keeps them
  // sharp at the size the page actually draws them (up to ~264px) without
  // carrying the reference site's full original resolution for no reason.
  const out = await sharp(buf)
    .resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const meta = await sharp(out).metadata();

  const fileName = slugify(name).slice(0, 40) + ".png";
  const key = path.posix.join("images", "partners", fileName);
  const abs = path.join(env.uploadDir, key);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, out);
  const saved = await storage().save({ path: abs, mimetype: "image/png" });

  const media = await Media.create({
    filename: fileName, originalName: fileName, key: saved.key, url: saved.url,
    mime: "image/png", size: out.length, width: meta.width, height: meta.height,
    alt: name, sourceUrl: url,
  });
  console.log(`  imported ${fileName.padEnd(46)} ${(buf.length / 1024).toFixed(0)}KB -> ${(out.length / 1024).toFixed(0)}KB  ${meta.width}x${meta.height}`);
  return media;
}

const stats = { updated: 0, created: 0, images: 0, reused: 0 };
let order = 0;

for (const section of data.sections) {
  const group = GROUP_OF[section.heading];
  if (!group) { console.log(`! unknown group heading "${section.heading}", skipped`); continue; }

  for (const item of section.items) {
    const slug = slugify(item.name);
    let partner = await Partner.findOne({ name: item.name, deletedAt: null });
    if (!partner) partner = await Partner.findOne({ slug });

    const isNew = !partner;
    if (isNew) {
      partner = new Partner({ name: item.name, slug, groups: [group], group });
      stats.created++;
    }

    let logo = null;
    if (item.img) {
      try {
        if (!DRY) {
          logo = await importLogo(item.img, item.name);
          stats.images++;
        } else {
          logo = await Media.findOne({ sourceUrl: item.img }).lean();
        }
      } catch (err) {
        console.log(`  ! logo for ${item.name}: ${err.message}`);
      }
    }

    const before = partner.description || "";
    console.log(`${item.name.padEnd(55)} group=${group.padEnd(12)} desc ${before.length}c -> ${item.body.length}c  ` +
      `${logo ? "image ok" : DRY ? "image: fetched on real run" : "no image"}`);

    if (!DRY) {
      // This script restores the reference page's own layout, so a partner is
      // put back in exactly the one section the reference site files it under.
      partner.groups = [group];
      partner.description = item.body;
      partner.isPrincipal = false;
      partner.sortOrder = order;
      if (logo?._id) partner.logo = logo._id;
      await partner.save();
    }
    order++;
    stats.updated++;
  }
}

// the hero photograph, already imported for Our History from the same source
let heroMedia = null;
if (data.heroImg) {
  try {
    heroMedia = DRY
      ? await Media.findOne({ sourceUrl: data.heroImg }).lean()
      : await importLogo(data.heroImg, "Our Partners hero"); // re-uses importLogo's dedupe+save path
  } catch (err) {
    console.log(`! hero image: ${err.message}`);
  }
}

console.log(`\n${DRY ? "[dry run] " : ""}partners processed: ${stats.updated} (${stats.created} new), ` +
  `images imported: ${stats.images}, reused: ${stats.reused}`);
console.log("hero image:", heroMedia?.url || "not resolved");

await disconnectDb();

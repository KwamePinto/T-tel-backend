/**
 * Fills in the Focus Areas and Programmes pages from the reference site.
 *
 *   node src/seed/importFocusContent.js [--dry]
 *
 * Those pages shipped with a single paragraph each — around 300 characters
 * where the reference site carries two to seven thousand. This replaces the
 * body of each one with the real copy, held in data/focus-programmes.json so
 * the import is reproducible without hitting the network again.
 *
 * What it does NOT touch: excerpts, hero images that already resolve, sort
 * order, tags, accents and numbering are all editorial decisions already made
 * in this database, and the reference site has no better version of them.
 *
 * Safe to re-run. A post whose body already matches is left alone, so running
 * it twice reports no changes rather than churning updatedAt.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDb, disconnectDb } from "../config/db.js";
import { env } from "../config/env.js";
import { Post } from "../models/Post.js";
import { ContentType } from "../models/ContentType.js";
import { Media } from "../models/Media.js";
import { storage } from "../services/storage.js";

const DRY = process.argv.includes("--dry");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const rows = JSON.parse(fs.readFileSync(path.join(HERE, "data", "focus-programmes.json"), "utf8"));

await connectDb();

const types = new Map();
for (const slug of ["focus-areas", "programmes"]) {
  const ct = await ContentType.findOne({ slug }).lean();
  if (!ct) throw new Error(`Missing content type "${slug}" — run the main seed first.`);
  types.set(slug, ct._id);
}

/** Pulls a hero image off the reference site and files it as a Media record. */
async function importHero(url, alt) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // The reference site serves these straight off the camera — one hero is
  // 6.5MB, which no visitor should pay for. A hero is never shown wider than
  // the viewport, so cap it and re-encode as webp.
  const { default: sharp } = await import("sharp");
  const out = await sharp(buf)
    .rotate()
    .resize({ width: 1920, height: 1080, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const name = `${alt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}.webp`;
  const key = path.posix.join("images", "programmes", name);

  // Write into the upload directory first, then hand it to whichever driver is
  // configured: on s3 that uploads and removes the staging copy, on local it
  // is already in the right place.
  const abs = path.join(env.uploadDir, key);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, out);

  const saved = await storage().save({ path: abs, mimetype: "image/webp" });
  console.log(`          ${name}  ${(buf.length / 1024).toFixed(0)}KB -> ${(out.length / 1024).toFixed(0)}KB`);

  return Media.create({
    filename: name, originalName: name,
    key: saved.key, url: saved.url,
    mime: "image/webp", size: out.length, alt,
  });
}

/** Posts whose stored title is wrong and should follow the reference site. */
const RETITLE = new Set(["edtech-hub"]);

const stats = { updated: 0, unchanged: 0, created: 0, retitled: 0, images: 0, missing: [] };

for (const row of rows) {
  if (!row.body) { stats.missing.push(`${row.slug}: no body crawled`); continue; }

  let post = await Post.findOne({ slug: row.slug, deletedAt: null });

  if (!post) {
    // Gates Foundation is on the reference site's Programmes menu but was
    // never in this database; the rest all exist already.
    if (DRY) { console.log(`would create  ${row.slug}`); stats.created++; continue; }
    post = new Post({
      slug: row.slug,
      contentType: types.get(row.type),
      title: row.title,
      status: "published",
      publishedAt: new Date(),
      sortOrder: 90,
    });
    stats.created++;
    console.log(`create    ${row.slug}`);
  }

  const before = post.body || "";
  if (before.trim() === row.body.trim()) {
    stats.unchanged++;
    console.log(`unchanged ${row.slug}`);
  } else {
    if (!DRY) post.body = row.body;
    stats.updated++;
    console.log(`body      ${row.slug.padEnd(46)} ${String(before.length).padStart(5)} -> ${row.body.length}`);
  }

  // Titles are deliberately NOT taken wholesale from the reference site: it
  // writes "Leaders In Teaching" and "Deliver Ed", and drops the ": Communities
  // of Excellence" subtitle, all of which are worse than what is already here.
  // Only edtech-hub was genuinely wrong — it carried the name of the study on
  // the page rather than the programme the menu points at.
  if (RETITLE.has(row.slug) && row.title && post.title !== row.title) {
    console.log(`title     ${row.slug.padEnd(46)} "${post.title}" -> "${row.title}"`);
    if (!DRY) post.title = row.title;
    stats.retitled++;
  }

  // Only fill a gap — an image already set here was chosen deliberately.
  if (!post.featuredImage && row.heroImage) {
    try {
      if (!DRY) {
        const media = await importHero(row.heroImage, row.title || row.slug);
        post.featuredImage = media._id;
      }
      stats.images++;
      console.log(`image     ${row.slug}`);
    } catch (err) {
      stats.missing.push(`${row.slug}: hero image — ${err.message}`);
    }
  }

  if (!DRY) await post.save();
}

console.log(`\n${DRY ? "[dry run] " : ""}bodies updated ${stats.updated}, unchanged ${stats.unchanged}, ` +
  `created ${stats.created}, retitled ${stats.retitled}, images ${stats.images}`);
stats.missing.forEach((m) => console.log(`  ! ${m}`));

await disconnectDb();

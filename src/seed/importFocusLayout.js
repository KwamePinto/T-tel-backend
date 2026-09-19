/**
 * Replicates the reference site's Focus Area and Programme pages: their
 * layout, their imagery and their copy.
 *
 *   node src/seed/importFocusLayout.js [--dry] [--keep-heroes]
 *
 * Supersedes importFocusContent.js, which brought the copy over as one column
 * of text. The pages it targets alternate copy with imagery, so the content is
 * stored as sections (see the Post model) and rendered by a component.
 *
 * Images are fetched once, resized and re-encoded as webp, then filed as Media
 * records keyed by their source URL, so a picture used on two pages is stored
 * once. The source serves them unprocessed — one is 13MB.
 *
 * Safe to re-run: an image already imported is reused, and a post whose
 * sections already match is left alone.
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
const KEEP_HEROES = process.argv.includes("--keep-heroes");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rows = JSON.parse(fs.readFileSync(path.join(HERE, "data", "focus-sections.json"), "utf8"));

await connectDb();

const types = new Map();
for (const slug of ["focus-areas", "programmes"]) {
  const ct = await ContentType.findOne({ slug }).lean();
  if (!ct) throw new Error(`Missing content type "${slug}" — run the main seed first.`);
  types.set(slug, ct._id);
}

/* ------------------------------------------------------------------ images */

const cache = new Map();   // source URL -> Media id
const stats = { pages: 0, sections: 0, images: 0, reused: 0, heroes: 0, bytesIn: 0, bytesOut: 0, problems: [] };

/** Turns a source image URL into a Media record, once per distinct URL. */
async function importImage(url, alt) {
  if (cache.has(url)) { stats.reused++; return cache.get(url); }

  // A previous run may already hold it: sourceUrl is the identity, because the
  // filenames the source uses are opaque hashes.
  const existing = await Media.findOne({ sourceUrl: url }).lean();
  if (existing) { cache.set(url, existing._id); stats.reused++; return existing._id; }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const { default: sharp } = await import("sharp");
  const out = await sharp(buf)
    .rotate()
    .resize({ width: 1600, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const stem = (alt || "image").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 34) || "image";
  // the source's own name is a hash; a short slice keeps two pictures with the
  // same alt text from colliding
  const name = `${stem}-${url.split("/").pop().slice(0, 8).toLowerCase()}.webp`;
  const key = path.posix.join("images", "pages", name);

  const abs = path.join(env.uploadDir, key);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, out);
  const saved = await storage().save({ path: abs, mimetype: "image/webp" });

  const media = await Media.create({
    filename: name, originalName: name,
    key: saved.key, url: saved.url,
    mime: "image/webp", size: out.length,
    alt: alt || "", sourceUrl: url,
  });

  stats.images++;
  stats.bytesIn += buf.length;
  stats.bytesOut += out.length;
  console.log(`    image  ${name.padEnd(46)} ${(buf.length / 1024).toFixed(0).padStart(6)}KB -> ${(out.length / 1024).toFixed(0)}KB`);
  cache.set(url, media._id);
  return media._id;
}

/* ------------------------------------------------------------------ copy */

const BULLET = /^\s*(?:[·•●▪◦‣]|[-–—])\s+/;

/** Renders the crawler's block fragments into the HTML one section holds. */
function toHtml(parts = []) {
  // a <strong> label and the value that follows it are one paragraph
  const merged = [];
  for (const b of parts) {
    const prev = merged[merged.length - 1];
    if (b.tag === "P" && prev?.tag === "P" && /<\/strong>$/.test(prev.html)) prev.html += " " + b.html;
    else merged.push({ ...b });
  }

  for (const part of merged) {
    part.html = (part.html || "")
      .replace(/ /g, " ")
      .replace(/ {2,}/g, " ")
      .replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, "&amp;")
      .trim();
  }

  // hand-typed bullet glyphs become a real list
  const grouped = [];
  for (const part of merged) {
    if (part.tag === "P" && BULLET.test(part.html.replace(/^<[^>]+>/, ""))) {
      const item = part.html.replace(BULLET, "").replace(/^(<[a-z]+>)\s*/i, "$1");
      const prev = grouped[grouped.length - 1];
      if (prev?.tag === "UL" && prev.synthetic) prev.html += `<li>${item}</li>`;
      else grouped.push({ tag: "UL", html: `<li>${item}</li>`, synthetic: true });
    } else grouped.push(part);
  }

  return grouped
    .map(({ tag, html }) => {
      const t = tag.toLowerCase();
      if (t === "ul" || t === "ol") return `<${t}>${html.replace(/^<[uo]l>|<\/[uo]l>$/g, "")}</${t}>`;
      return `<${t}>${html}</${t}>`;
    })
    .join("\n");
}

/* ------------------------------------------------------------------ import */

for (const row of rows) {
  let post = await Post.findOne({ slug: row.slug, deletedAt: null });
  if (!post) {
    if (DRY) { console.log(`would create ${row.slug}`); continue; }
    post = new Post({
      slug: row.slug, contentType: types.get(row.type), title: row.title,
      status: "published", publishedAt: new Date(), sortOrder: 90,
    });
    console.log(`create   ${row.slug}`);
  }

  console.log(`\n${row.slug}  (${row.sections.map((s) => s.type).join(", ")})`);

  const sections = [];
  for (const s of row.sections) {
    const section = { type: s.type, html: "", aside: "", flip: !!s.flip };

    if (s.type === "facts") {
      section.aside = toHtml(s.aside);
      section.html = toHtml(s.parts);
    } else if (s.type === "image") {
      section.html = "";
    } else {
      section.html = toHtml(s.parts);
    }

    if (s.image) {
      try {
        if (!DRY) section.image = await importImage(s.image, s.imageAlt || row.title);
      } catch (err) {
        stats.problems.push(`${row.slug}: ${s.image} — ${err.message}`);
      }
    }
    sections.push(section);
    stats.sections++;
  }

  if (!KEEP_HEROES && row.heroImage) {
    try {
      if (!DRY) {
        post.featuredImage = await importImage(row.heroImage, `${row.title} hero`);
        stats.heroes++;
      }
    } catch (err) {
      stats.problems.push(`${row.slug}: hero ${row.heroImage} — ${err.message}`);
    }
  }

  if (!DRY) {
    post.sections = sections;
    // keep body as the plain-text fallback for search and for any surface that
    // has not learned about sections
    post.body = sections.filter((x) => x.html).map((x) => x.html).join("\n");
    await post.save();
  }
  stats.pages++;
}

console.log(`\n${DRY ? "[dry run] " : ""}pages ${stats.pages}, sections ${stats.sections}, ` +
  `images ${stats.images} (${stats.reused} reused), heroes ${stats.heroes}`);
if (stats.bytesIn) {
  console.log(`images ${(stats.bytesIn / 1024 / 1024).toFixed(1)}MB -> ${(stats.bytesOut / 1024 / 1024).toFixed(1)}MB ` +
    `(${(100 - (stats.bytesOut / stats.bytesIn) * 100).toFixed(0)}% smaller)`);
}
stats.problems.forEach((p) => console.log(`  ! ${p}`));

await disconnectDb();

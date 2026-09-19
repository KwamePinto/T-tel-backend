/**
 * Imports content scraped from the live CMS into MongoDB.
 *
 *   node src/seed/importLive.js <posts-full.json> [--images]
 *
 * --images also downloads each featured image into the media library.
 * Matching is by slug, so re-running updates rather than duplicating.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { connectDb, disconnectDb } from "../config/db.js";
import { ContentType, Post, Page, Media, Tag, User } from "../models/index.js";
import { toSlug, uniqueSlug } from "../utils/slug.js";

const file = process.argv[2];
const withImages = process.argv.includes("--images");

if (!file || !fs.existsSync(file)) {
  console.error("Usage: node src/seed/importLive.js <posts-full.json> [--images]");
  process.exit(1);
}

/** Maps the live CMS's content-type labels onto ours. */
const TYPE_MAP = { Blog: "blog", "Focus Areas": "focus-areas", Programmes: "programmes" };

/** Records with no content type are really page copy. */
const PAGE_MAP = {
  "who we are": "about-us",
  "our history": "about-us/our-history",
  "our partners": "about-us/our-partners",
  "our policies": "about-us/our-policies",
};

// The live data carries a few 1991/1999 timestamps that are clearly typos.
const EARLIEST_SANE = new Date("2014-01-01");

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("too many redirects"));
    const client = url.startsWith("https") ? https : http;
    const out = fs.createWriteStream(dest);
    client
      .get(url, { timeout: 30000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          out.close();
          fs.rmSync(dest, { force: true });
          const next = new URL(res.headers.location, url).toString();
          return download(next, dest, redirects + 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          out.close();
          fs.rmSync(dest, { force: true });
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        res.pipe(out);
        out.on("finish", () => out.close(() => resolve(dest)));
      })
      .on("error", (err) => {
        out.close();
        fs.rmSync(dest, { force: true });
        reject(err);
      });
  });
}

async function importImage(url, alt) {
  if (!url) return null;
  const absolute = url.startsWith("http")
    ? url.replace(/^http:/, "https:")
    : `https://t-tel-live.citservices.net${url}`;

  let name;
  try {
    name = decodeURIComponent(path.basename(new URL(absolute).pathname));
  } catch {
    return null;
  }
  if (!name) return null;

  const existing = await Media.findOne({ originalName: name });
  if (existing) return existing._id;

  const dir = path.join(env.uploadDir, "imported");
  fs.mkdirSync(dir, { recursive: true });
  const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${name}`.replace(/[^\w.-]/g, "_");
  const dest = path.join(dir, safe);

  try {
    await download(absolute, dest);
  } catch (err) {
    console.log(`    ! image ${name}: ${err.message}`);
    return null;
  }

  const ext = path.extname(name).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" :
    ext === ".gif" ? "image/gif" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";

  const doc = await Media.create({
    filename: safe,
    originalName: name,
    key: `imported/${safe}`,
    url: `${env.publicUrl}/uploads/imported/${safe}`,
    mime,
    size: fs.statSync(dest).size,
    alt: alt || "",
  });
  return doc._id;
}

async function tagIds(csv) {
  if (!csv) return [];
  const ids = [];
  for (const name of csv.split(",").map((t) => t.trim()).filter(Boolean)) {
    const slug = toSlug(name);
    const tag = await Tag.findOneAndUpdate(
      { slug }, { $setOnInsert: { name, slug } }, { upsert: true, new: true },
    );
    ids.push(tag._id);
  }
  return ids;
}

function sanePublishedAt(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.valueOf()) || d < EARLIEST_SANE || d > new Date(Date.now() + 86400000 * 365)) {
    return null;
  }
  return d;
}

async function main() {
  await connectDb();
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));

  // The live data contains duplicate titles (e.g. two "Curriculum and
  // Assessment"). Keep the richest version of each.
  const bySlug = new Map();
  for (const row of raw) {
    if (!row.title?.trim()) continue;
    const key = toSlug(row.title);
    const prev = bySlug.get(key);
    if (!prev || (row.body?.length || 0) > (prev.body?.length || 0)) bySlug.set(key, row);
  }
  const rows = [...bySlug.values()];
  console.log(`[import] ${raw.length} scraped → ${rows.length} unique\n`);

  const types = Object.fromEntries((await ContentType.find().lean()).map((t) => [t.slug, t._id]));
  const author = await User.findOne({ role: "admin" });

  let created = 0, updated = 0, pages = 0, skipped = 0, images = 0;

  for (const row of rows) {
    const title = row.title.trim();
    const untyped = !TYPE_MAP[row.contentType];
    const pageSlug = PAGE_MAP[title.toLowerCase()];

    /* ---- page copy ---- */
    if (untyped && pageSlug) {
      const page = await Page.findOne({ slug: pageSlug });
      if (page) {
        page.body = row.body || page.body;
        await page.save();
        pages++;
      } else {
        console.log(`    ! no page for "${title}" (${pageSlug})`);
        skipped++;
      }
      continue;
    }
    if (untyped) { skipped++; continue; }

    /* ---- posts ---- */
    const contentType = types[TYPE_MAP[row.contentType]];
    if (!contentType) { skipped++; continue; }

    const slug = toSlug(title);
    const existing = await Post.findOne({ slug });
    const isCurated = TYPE_MAP[row.contentType] !== "blog";

    let featuredImage = existing?.featuredImage ?? null;
    if (withImages && row.featured && !featuredImage) {
      const id = await importImage(row.featured, title);
      if (id) { featuredImage = id; images++; }
    }

    const fields = {
      contentType,
      title,
      excerpt: (row.excerpt || "").trim() || existing?.excerpt || "",
      body: row.body || "",
      status: "published",
      tags: await tagIds(row.tags),
      author: author?._id,
      ...(featuredImage ? { featuredImage } : {}),
    };

    // Curated types keep the ordering and publish date we seeded; only their
    // copy is refreshed. Blog posts take the live publish date.
    const when = sanePublishedAt(row.publishedAt);
    if (!isCurated) fields.publishedAt = when || existing?.publishedAt || new Date();
    else if (!existing?.publishedAt) fields.publishedAt = when || new Date();

    if (existing) {
      Object.assign(existing, fields);
      await existing.save();
      updated++;
    } else {
      await Post.create({ ...fields, slug: await uniqueSlug(Post, slug) });
      created++;
    }
  }

  const counts = {};
  for (const [slug, id] of Object.entries(types)) {
    counts[slug] = await Post.countDocuments({ contentType: id, deletedAt: null });
  }

  console.log(`\n[import] posts created ${created}, updated ${updated}`);
  console.log(`[import] page bodies filled ${pages}, skipped ${skipped}, images ${images}`);
  console.log("[import] posts per type:", counts, "\n");

  await disconnectDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("[import] failed:", err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});

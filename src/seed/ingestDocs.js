/**
 * Ingests the Knowledge Hub PDFs.
 *
 *   node src/seed/ingestDocs.js [--src ../KnowledgeHubFiles] [--limit N] [--dry]
 *
 * For each PDF it:
 *   - copies it into UPLOAD_DIR/documents/<collection>/
 *   - renders page 1 to a WebP cover thumbnail
 *   - creates the Media + Document records
 *
 * Deduplication is per collection, not global: the source files the same
 * National Teachers' Standards PDF under three folders, and each of those is a
 * real collection on the site. The second and third occurrences reuse the
 * stored file and its cover, so only the Document record is new.
 *
 * Safe to re-run: anything already present for that collection is skipped, so
 * an interrupted run can simply be started again.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { env, ROOT } from "../config/env.js";
import { connectDb, disconnectDb } from "../config/db.js";
import { Document, DocumentCategory, Media } from "../models/index.js";
import { DOCUMENT_COLLECTION_TREE } from "./defaults.js";
import { uniqueSlug } from "../utils/slug.js";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const SRC = path.resolve(ROOT, flag("src", "../KnowledgeHubFiles"));
const LIMIT = Number(flag("limit", 0)) || Infinity;
const DRY = args.includes("--dry");

const UPLOADS = path.resolve(ROOT, env.uploadDir || "uploads");
const log = (...a) => console.log("  ", ...a);

/** Source folder name -> collection slug. Several folders feed one collection. */
const FOLDER_MAP = {
  "bed resources": "bed-resources",
  "impact learning and good practice": "impact-learning-and-good-practice",
  "college leadership management": "college-leadership-and-management",
  "teacher education policy and institution development": "teacher-education-policy-and-institutional-development",
  "teacher education policy n institutional development": "teacher-education-policy-and-institutional-development",
  "basic education": "basic-education",
  "secondary education main": "secondary-education",
  "seondary edu 2": "secondary-education",
  sec3: "secondary-education",
  sec4: "secondary-education",
  "ttel report": "reports-and-publications",
};

/** Rebuilds the collection tree, preserving any existing records by slug. */
async function ensureCollections() {
  const bySlug = new Map();
  for (const top of DOCUMENT_COLLECTION_TREE) {
    const doc = await DocumentCategory.findOneAndUpdate(
      { slug: top.slug },
      { $set: { name: top.name, sortOrder: top.sortOrder, parent: null } },
      { new: true, upsert: true },
    );
    bySlug.set(top.slug, doc);

    for (const child of top.children || []) {
      const c = await DocumentCategory.findOneAndUpdate(
        { slug: child.slug },
        { $set: { name: child.name, sortOrder: child.sortOrder, parent: doc._id } },
        { new: true, upsert: true },
      );
      bySlug.set(child.slug, c);
    }
  }

  // drop collections that are no longer part of the structure and hold nothing
  const keep = new Set(bySlug.keys());
  for (const stale of await DocumentCategory.find({ slug: { $nin: [...keep] } })) {
    const count = await Document.countDocuments({ category: stale._id });
    if (!count) {
      await stale.deleteOne();
      log(`removed empty collection: ${stale.slug}`);
    } else {
      log(`! kept ${stale.slug} — still holds ${count} document(s)`);
    }
  }
  return bySlug;
}

/** "CEP PLC Handbook 2_Literacy across the curriculum.pdf" -> readable title */
function titleFrom(filename) {
  let t = path.basename(filename, path.extname(filename));
  t = t.replace(/[_]+/g, " ");                       // underscores are word breaks
  t = t.replace(/\[\d+\]|\(\d+\)/g, "");             // WordPress dedupe suffixes
  t = t.replace(/\b(v\d+|final|draft\d*|online|repaired|combined)\b/gi, "");
  t = t.replace(/-+/g, " ").replace(/\s+/g, " ").trim();
  // the strips above can leave empty or dangling brackets behind
  t = t.replace(/\(\s*\)|\[\s*\]/g, "").replace(/\s+([,.;:])/g, "$1");
  t = t.replace(/\s+/g, " ").replace(/^[\s,.\-–]+|[\s,.\-–]+$/g, "").trim();
  if (!t) return "Untitled document";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Pulls a 4-digit year out of the name when there is one. */
function yearFrom(name) {
  const m = String(name).match(/\b(19|20)\d{2}\b/);
  const y = m ? Number(m[0]) : null;
  return y && y >= 2010 && y <= new Date().getFullYear() + 1 ? y : null;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.pdf$/i.test(entry.name)) out.push(p);
  }
  return out;
}

/** Which collection a file belongs to, from the top-level folder it sits in. */
function collectionFor(file) {
  const rel = path.relative(SRC, file).split(path.sep);
  for (const part of rel) {
    const hit = FOLDER_MAP[part.toLowerCase().trim()];
    if (hit) return hit;
  }
  return null;
}

// pdfjs ships these as files rather than bundling them. Without wasmUrl any
// page carrying a JPEG 2000 image renders with that image missing, which on a
// scanned cover means a blank thumbnail.
const PDFJS_ROOT = path.join(ROOT, "node_modules", "pdfjs-dist");
const asUrl = (p) => `${new URL(`file://${p.split(path.sep).join("/")}`).href}/`;
const PDFJS_ASSETS = {
  wasmUrl: asUrl(path.join(PDFJS_ROOT, "wasm")),
  standardFontDataUrl: asUrl(path.join(PDFJS_ROOT, "standard_fonts")),
  cMapUrl: asUrl(path.join(PDFJS_ROOT, "cmaps")),
  cMapPacked: true,
};

async function makeThumbnail(pdfPath, outPath) {
  // imported lazily: the renderer pulls in a canvas binding we only need here
  const { pdf } = await import("pdf-to-img");
  const doc = await pdf(pdfPath, { scale: 1.5, docInitParams: PDFJS_ASSETS });
  for await (const page of doc) {
    await sharp(page)
      .resize({ width: 480, withoutEnlargement: true })
      .webp({ quality: 74 })
      .toFile(outPath);
    return true; // first page only
  }
  return false;
}

async function main() {
  await connectDb();
  console.log(`[ingest] source: ${SRC}`);

  if (!fs.existsSync(SRC)) {
    console.error(`source folder not found: ${SRC}`);
    await disconnectDb();
    process.exit(1);
  }

  const collections = await ensureCollections();
  const files = walk(SRC);
  console.log(`[ingest] ${files.length} PDF(s) found\n`);

  // A document can legitimately belong to more than one collection — the
  // source has the same National Teachers' Standards PDF filed under three.
  // So dedupe per collection, and reuse the stored file when a hash has been
  // ingested elsewhere rather than copying and re-rendering it.
  const seen = new Set();      // "<hash>:<collection>" already present
  const byHash = new Map();    // hash -> { file, thumbnail } media ids
  for (const d of await Document.find({ sourceHash: { $ne: null } })
    .select("sourceHash category file thumbnail").populate("category", "slug").lean()) {
    seen.add(`${d.sourceHash}:${d.category?.slug}`);
    if (!byHash.has(d.sourceHash)) byHash.set(d.sourceHash, { file: d.file, thumbnail: d.thumbnail });
  }

  const stats = { added: 0, shared: 0, duplicate: 0, skipped: 0, thumbFailed: 0, unmapped: 0, bytes: 0 };
  let n = 0;

  for (const file of files) {
    if (n >= LIMIT) break;

    const slug = collectionFor(file);
    if (!slug) {
      stats.unmapped++;
      log(`? no collection for ${path.relative(SRC, file)}`);
      continue;
    }

    const buf = fs.readFileSync(file);
    const hash = crypto.createHash("sha1").update(buf).digest("hex");
    if (seen.has(`${hash}:${slug}`)) { stats.duplicate++; continue; }
    seen.add(`${hash}:${slug}`);

    const category = collections.get(slug);
    const title = titleFrom(file);
    n++;

    if (DRY) {
      log(`[dry] ${slug.padEnd(48)} ${title.slice(0, 60)}`);
      stats.added++;
      continue;
    }

    // already stored under another collection: point at the same files
    const shared = byHash.get(hash);
    if (shared) {
      await Document.create({
        title,
        slug: await uniqueSlug(Document, title),
        category: category._id,
        file: shared.file,
        thumbnail: shared.thumbnail || null,
        year: yearFrom(path.basename(file)),
        status: "published",
        sourceHash: hash,
      });
      stats.shared++;
      stats.added++;
      continue;
    }

    const destDir = path.join(UPLOADS, "documents", slug);
    const thumbDir = path.join(UPLOADS, "thumbnails", slug);
    fs.mkdirSync(destDir, { recursive: true });
    fs.mkdirSync(thumbDir, { recursive: true });

    const base = `${hash.slice(0, 10)}-${path.basename(file).replace(/[^\w.\-]+/g, "_")}`;
    const destPath = path.join(destDir, base);
    const thumbName = base.replace(/\.pdf$/i, "") + ".webp";
    const thumbPath = path.join(thumbDir, thumbName);

    fs.copyFileSync(file, destPath);
    stats.bytes += buf.length;

    let thumbMedia = null;
    try {
      if (await makeThumbnail(file, thumbPath)) {
        thumbMedia = await Media.create({
          filename: thumbName,
          originalName: thumbName,
          key: path.posix.join("thumbnails", slug, thumbName),
          url: `/uploads/thumbnails/${slug}/${thumbName}`,
          mime: "image/webp",
          size: fs.statSync(thumbPath).size,
          alt: `Cover of ${title}`,
        });
      }
    } catch (err) {
      stats.thumbFailed++;
      log(`! thumbnail failed for ${path.basename(file)}: ${String(err.message).slice(0, 70)}`);
    }

    const fileMedia = await Media.create({
      filename: base,
      originalName: path.basename(file),
      key: path.posix.join("documents", slug, base),
      url: `/uploads/documents/${slug}/${base}`,
      mime: "application/pdf",
      size: buf.length,
      alt: title,
    });

    await Document.create({
      title,
      slug: await uniqueSlug(Document, title),
      category: category._id,
      file: fileMedia._id,
      thumbnail: thumbMedia?._id || null,
      year: yearFrom(path.basename(file)),
      status: "published",
      sourceHash: hash,
    });

    byHash.set(hash, { file: fileMedia._id, thumbnail: thumbMedia?._id || null });
    stats.added++;
    if (stats.added % 25 === 0) log(`… ${stats.added} ingested`);
  }

  console.log("\n[ingest] done");
  console.log(`   added:        ${stats.added}`);
  console.log(`   shared file:  ${stats.shared} (same PDF filed under another collection)`);
  console.log(`   duplicates:   ${stats.duplicate}`);
  console.log(`   unmapped:     ${stats.unmapped}`);
  console.log(`   thumb failed: ${stats.thumbFailed}`);
  console.log(`   copied:       ${(stats.bytes / 1024 / 1024).toFixed(0)}MB`);

  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});

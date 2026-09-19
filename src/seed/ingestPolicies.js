/**
 * Ingests the Our Policies PDFs and attaches them to the existing records.
 *
 *   node src/seed/ingestPolicies.js [--src ../otherassets/ourPoliciesfiles] [--dry]
 *
 * The seed already created the five policies as drafts with the right titles,
 * so this matches each file to its record rather than creating duplicates,
 * attaches the PDF and its cover, and publishes it. Anything that doesn't match
 * a known policy is added as a new document in the Policies collection.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { env, ROOT } from "../config/env.js";
import { connectDb, disconnectDb } from "../config/db.js";
import { Document, DocumentCategory, Media } from "../models/index.js";
import { uniqueSlug } from "../utils/slug.js";

const args = process.argv.slice(2);
const flagged = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const SRC = path.resolve(ROOT, flagged("src", "../otherassets/ourPoliciesfiles"));
const DRY = args.includes("--dry");
const UPLOADS = path.resolve(ROOT, env.uploadDir || "uploads");

/**
 * Distinctive words in the filename -> words that identify the existing
 * record. Matched against the record's title case-insensitively rather than
 * by exact string, because the seeded titles are not spelled the way the
 * filenames are ("T-TEL Sexual Harassment Policy" vs the file's wording).
 */
const MATCHERS = [
  [/sexual[-_ ]?harassment/i, /sexual harassment/i],
  [/safeguard|child.*youth/i, /safeguard/i],
  [/conflict.*interest/i, /conflict of interest/i],
  [/ip[-_ ]?policy|intellectual/i, /intellectual property/i],
  [/gesi|gender/i, /gender equality|social inclusion/i],
];

const PDFJS_ROOT = path.join(ROOT, "node_modules", "pdfjs-dist");
const asUrl = (p) => `${new URL(`file://${p.split(path.sep).join("/")}`).href}/`;
const PDFJS_ASSETS = {
  wasmUrl: asUrl(path.join(PDFJS_ROOT, "wasm")),
  standardFontDataUrl: asUrl(path.join(PDFJS_ROOT, "standard_fonts")),
  cMapUrl: asUrl(path.join(PDFJS_ROOT, "cmaps")),
  cMapPacked: true,
};

async function cover(pdfPath, outPath) {
  const { pdf } = await import("pdf-to-img");
  const doc = await pdf(pdfPath, { scale: 1.5, docInitParams: PDFJS_ASSETS });
  for await (const page of doc) {
    await sharp(page).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 74 }).toFile(outPath);
    return true;
  }
  return false;
}

/** "T-TEL_Sexual-Harassment-Policy_rvsd_October-2023" -> readable fallback */
function titleFrom(file) {
  let t = path.basename(file, path.extname(file));
  t = t.replace(/^\d+[-_]/, "").replace(/[_]+/g, " ").replace(/-+/g, " ");
  t = t.replace(/\brvsd\b/gi, "revised").replace(/\s{2,}/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

await connectDb();
console.log(`[policies] source: ${SRC}`);

if (!fs.existsSync(SRC)) {
  console.error("source folder not found");
  await disconnectDb();
  process.exit(1);
}

const collection = await DocumentCategory.findOne({ slug: "policies" });
if (!collection) {
  console.error("policies collection missing — run the ingest first");
  await disconnectDb();
  process.exit(1);
}

const files = fs.readdirSync(SRC).filter((f) => /\.pdf$/i.test(f));
console.log(`[policies] ${files.length} PDF(s)\n`);

const destDir = path.join(UPLOADS, "documents", "policies");
const thumbDir = path.join(UPLOADS, "thumbnails", "policies");
if (!DRY) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.mkdirSync(thumbDir, { recursive: true });
}

let attached = 0;
let created = 0;

for (const name of files) {
  const abs = path.join(SRC, name);
  const buf = fs.readFileSync(abs);
  const hash = crypto.createHash("sha1").update(buf).digest("hex");

  const titleMatch = MATCHERS.find(([fileRe]) => fileRe.test(name))?.[1];
  const existing = titleMatch
    ? await Document.findOne({ title: titleMatch, deletedAt: null })
    : null;

  if (DRY) {
    console.log(`  [dry] ${name}\n        -> ${existing ? `attach to "${existing.title}"` : `create "${titleFrom(name)}"`}`);
    continue;
  }

  const base = `${hash.slice(0, 10)}-${name.replace(/[^\w.\-]+/g, "_")}`;
  fs.copyFileSync(abs, path.join(destDir, base));

  const thumbName = base.replace(/\.pdf$/i, "") + ".webp";
  let thumbMedia = null;
  try {
    if (await cover(abs, path.join(thumbDir, thumbName))) {
      thumbMedia = await Media.create({
        filename: thumbName, originalName: thumbName,
        key: path.posix.join("thumbnails", "policies", thumbName),
        url: `/uploads/thumbnails/policies/${thumbName}`,
        mime: "image/webp", size: fs.statSync(path.join(thumbDir, thumbName)).size,
        alt: `Cover of ${existing?.title || titleFrom(name)}`,
      });
    }
  } catch (err) {
    console.log(`  ! cover failed for ${name}: ${String(err.message).slice(0, 60)}`);
  }

  const fileMedia = await Media.create({
    filename: base, originalName: name,
    key: path.posix.join("documents", "policies", base),
    url: `/uploads/documents/policies/${base}`,
    mime: "application/pdf", size: buf.length,
    alt: existing?.title || titleFrom(name),
  });

  if (existing) {
    existing.file = fileMedia._id;
    existing.thumbnail = thumbMedia?._id || null;
    existing.category = collection._id;
    existing.status = "published";
    existing.sourceHash = hash;
    await existing.save();
    attached++;
    console.log(`  attached  ${existing.title}`);
  } else {
    const title = titleFrom(name);
    await Document.create({
      title,
      slug: await uniqueSlug(Document, title),
      category: collection._id,
      file: fileMedia._id,
      thumbnail: thumbMedia?._id || null,
      status: "published",
      sourceHash: hash,
    });
    created++;
    console.log(`  created   ${title}`);
  }
}

console.log(`\n[policies] ${attached} attached, ${created} created`);
await disconnectDb();

/**
 * Makes the Knowledge Hub read exactly like t-tel.org's.
 *
 *   node src/seed/syncKnowledgeHubWithLiveSite.js <sync-input.json> --dry
 *   node src/seed/syncKnowledgeHubWithLiveSite.js <sync-input.json> [--only <key>] [--limit N]
 *
 * The input lists, per collection (and per tag group within Secondary
 * Education), the documents t-tel.org shows, in the order it shows them, each
 * with the WPDM id its file downloads under.
 *
 * For every one of those, this decides between three outcomes:
 *
 *   keep    - a document of ours already carries that exact title
 *   rename  - we already hold the very same bytes under a different title
 *             (matched on the SHA-1 of the file, so this is a fact, not a
 *             guess), so it is renamed in place rather than duplicated
 *   add     - we don't hold it, so it is downloaded, given a cover, stored
 *             and created
 *
 * The rename case is the one that matters: the previous fetcher created a
 * *second* document whenever it recognised bytes it had already stored, which
 * is how the Knowledge Hub ended up with two copies of the 2025-26 Director's
 * Report. Matching on the file hash and renaming instead is what keeps the
 * listing identical to t-tel.org without piling up duplicates.
 *
 * Anything of ours with no counterpart keeps its name and sorts after the
 * matched ones, so nothing is hidden or lost.
 *
 * Safe to re-run: a title already correct is left alone, and a document's own
 * hash can't be mistaken for a different one.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { connectDb, disconnectDb } from "../config/db.js";
import { env, ROOT } from "../config/env.js";
import { storage } from "../services/storage.js";
import { uniqueSlug } from "../utils/slug.js";
import { Document, DocumentCategory, Media } from "../models/index.js";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const ONLY = flag("only", null);
const LIMIT = Number(flag("limit", Infinity));
const CONCURRENCY = Math.max(1, Number(flag("concurrency", 6)));
const TRIES = Math.max(1, Number(flag("tries", 6)));
const FILE = args.find((a) => a.endsWith(".json"));
const UPLOADS = env.uploadDir;

const PDFJS_ROOT = path.join(ROOT, "node_modules", "pdfjs-dist");
const asUrl = (p) => `${new URL(`file://${p.split(path.sep).join("/")}`).href}/`;
const PDFJS_ASSETS = {
  wasmUrl: asUrl(path.join(PDFJS_ROOT, "wasm")),
  standardFontDataUrl: asUrl(path.join(PDFJS_ROOT, "standard_fonts")),
  cMapUrl: asUrl(path.join(PDFJS_ROOT, "cmaps")),
  cMapPacked: true,
};

async function makeThumbnail(pdfPath, outPath) {
  const { pdf } = await import("pdf-to-img");
  const doc = await pdf(pdfPath, { scale: 1.5, docInitParams: PDFJS_ASSETS });
  for await (const page of doc) {
    await sharp(page).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 74 }).toFile(outPath);
    return true;
  }
  return false;
}

const TYPES = [
  [Buffer.from("%PDF"), "application/pdf", ".pdf"],
  [Buffer.from("PK\x03\x04"), "application/zip", ".zip"],
  [Buffer.from("\xD0\xCF\x11\xE0", "binary"), "application/msword", ".doc"],
];

/**
 * The file behind a WPDM id, downloaded resumably.
 *
 * Some of these handbooks are 150MB and this link resets connections part-way
 * through them; retrying the whole file from zero never got past the same
 * point twice. t-tel.org honours the *start* of a byte range even though it
 * ignores the end (asking for bytes 1000-1099 returns everything from 1000
 * onwards), so a dropped transfer can be picked up where it stopped and the
 * bytes kept. Each attempt only has to outlive the next few megabytes.
 *
 * A text/html body means the download is withdrawn on their side — there is
 * nothing to fetch, and that is reported rather than retried.
 */
async function download(wpdmdl) {
  const url = `https://t-tel.org/?wpdmdl=${wpdmdl}`;
  let buf = Buffer.alloc(0);
  let stalled = 0;
  let lastErr = null;
  let declaredName = ""; // the server names the file, which is how a .docx is told from a .zip

  for (let attempt = 1; attempt <= 40; attempt++) {
    const before = buf.length;
    try {
      const headers = before ? { range: `bytes=${before}-` } : {};
      const res = await fetch(url, { redirect: "follow", headers, signal: AbortSignal.timeout(120000) });
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
      if (!declaredName) declaredName = (res.headers.get("content-disposition") || "").match(/filename="?([^"]+)"?/)?.[1] || "";

      for await (const chunk of res.body) {
        buf = buf.length ? Buffer.concat([buf, chunk]) : Buffer.from(chunk);
      }
      lastErr = null;
      break; // body ended cleanly — the file is whole
    } catch (err) {
      lastErr = err;
      if (err.withdrawn) throw err;
      const gained = buf.length - before;
      if (gained === 0) stalled += 1; else stalled = 0;
      if (stalled >= 6) break;
      if (attempt < 40) {
        const wait = Math.min(8000, 500 * attempt);
        if (buf.length) console.log(`     … cut at ${(buf.length / 1048576).toFixed(1)}MB, resuming (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  if (!buf.length) throw lastErr || new Error("no bytes received");

  const head = buf.subarray(0, 4);
  for (const [magic, mime, ext] of TYPES) {
    if (head.equals(magic)) {
      const realExt = path.extname(declaredName).toLowerCase();
      if (realExt && realExt !== ext) return { buf, mime, ext: realExt };
      return { buf, mime, ext };
    }
  }
  if (/^\s*<!DOCTYPE|^\s*<html/i.test(buf.subarray(0, 40).toString("utf8"))) {
    const e = new Error("download withdrawn on t-tel.org (served a web page)");
    e.withdrawn = true;
    throw e;
  }
  throw new Error(`unrecognised file type (starts "${buf.subarray(0, 24).toString("utf8").replace(/\s+/g, " ")}")`);
}

/**
 * Retries anything that crosses the network.
 *
 * This runs over a cellular link that drops mid-transfer, so a half-finished
 * response is an ordinary event, not a failure worth giving up on — 27
 * documents were lost to it on the first pass. `terminated` in particular is
 * how undici reports a body aborted part-way, and it was missing from this
 * list, so those were never retried at all.
 */
const TRANSIENT = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|socket hang up|network|fetch failed|terminated|aborted|UND_ERR|other side closed|body/i;

async function withRetry(label, fn, tries = TRIES) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      if (err.withdrawn) throw err;
      const transient = TRANSIENT.test(`${err.code || ""} ${err.cause?.code || ""} ${err.cause?.message || ""} ${err.message || ""}`);
      if (!transient || i === tries) throw err;
      const wait = Math.min(30000, 1500 * 2 ** (i - 1));
      console.log(`     … ${label} ${err.cause?.message || err.message || err.code} — retry ${i + 1}/${tries} in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

const safe = (s) => s.replace(/[^\w.\-]+/g, "_").slice(0, 80);

async function main() {
  if (!FILE || !fs.existsSync(FILE)) throw new Error("Pass sync-input.json as an argument.");
  const allUnits = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const units = ONLY ? allUnits.filter((u) => u.key === ONLY) : allUnits;
  if (!units.length) throw new Error(`No unit matches --only ${ONLY}`);

  await connectDb();

  // every document currently in play, so "do we already hold these bytes" is a
  // lookup rather than a query per download
  const allDocs = await Document.find({ deletedAt: null })
    .select("_id title category tags sortOrder status sourceHash file thumbnail").lean();
  const byHash = new Map();
  for (const d of allDocs) {
    if (!d.sourceHash) continue;
    if (!byHash.has(d.sourceHash)) byHash.set(d.sourceHash, []);
    byHash.get(d.sourceHash).push(d);
  }
  const claimed = new Set();

  const stats = { keep: 0, rename: 0, add: 0, withdrawn: 0, failed: 0, bytes: 0, published: 0 };
  const gaps = [];
  const failures = [];
  const renamedLog = [];

  // group the units by collection so positions can run continuously across a
  // collection's tag groups (Secondary Education has five)
  const byCategory = new Map();
  for (const u of units) {
    if (!byCategory.has(u.category)) byCategory.set(u.category, []);
    byCategory.get(u.category).push(u);
  }

  for (const [slug, catUnits] of byCategory) {
    const category = await DocumentCategory.findOne({ slug });
    if (!category) { console.log(`! no collection ${slug}`); continue; }

    // ---- work out what each live document should become ----
    const jobs = [];
    for (const unit of catUnits) {
      for (const [i, doc] of unit.docs.entries()) {
        jobs.push({ unit, doc, positionInUnit: i + 1 });
      }
    }
    console.log(`\n${slug}: ${jobs.length} document(s) on t-tel.org across ${catUnits.length} group(s)`);

    let pos = 1;
    const results = [];

    // the pass that needs no network: titles that already match
    const pending = [];
    for (const job of jobs) {
      const match = allDocs.find((d) =>
        !claimed.has(String(d._id)) &&
        d.category && String(d.category) === String(category._id) &&
        d.title === job.doc.title);
      if (match) {
        claimed.add(String(match._id));
        stats.keep += 1;
        results.push({ ...job, action: "keep", target: match });
      } else {
        pending.push(job);
      }
    }

    // the rest need the file itself, to hash it
    let done = 0;
    async function worker() {
      while (pending.length) {
        const job = pending.shift();
        if (done >= LIMIT) return;
        done += 1;
        if (!job.doc.wpdmdl) {
          stats.failed += 1;
          failures.push(`${job.doc.title}: no download id`);
          continue;
        }
        let file;
        try {
          file = await withRetry("download", () => download(job.doc.wpdmdl));
        } catch (err) {
          if (err.withdrawn) {
            stats.withdrawn += 1;
            gaps.push({ slug, title: job.doc.title, why: "withdrawn on t-tel.org" });
          } else {
            stats.failed += 1;
            failures.push(`${job.doc.title}: ${err.message.slice(0, 60)}`);
          }
          continue;
        }

        const hash = crypto.createHash("sha1").update(file.buf).digest("hex");
        stats.bytes += file.buf.length;

        // already held, under some other name?
        const holder = (byHash.get(hash) || []).find((d) =>
          !claimed.has(String(d._id)) &&
          d.category && String(d.category) === String(category._id));

        if (holder) {
          claimed.add(String(holder._id));
          renamedLog.push({ slug, from: holder.title, to: job.doc.title });
          results.push({ ...job, action: "rename", target: holder });
          stats.rename += 1;
          console.log(`   ~ ${holder.title.slice(0, 46)}\n        -> ${job.doc.title.slice(0, 66)}`);
          continue;
        }

        if (DRY) {
          stats.add += 1;
          results.push({ ...job, action: "add", hash });
          console.log(`   + ${job.doc.title.slice(0, 66)} (${(file.buf.length / 1024 / 1024).toFixed(1)}MB, would add)`);
          continue;
        }

        // genuinely new: store it
        const base = `${hash.slice(0, 10)}-${safe(job.doc.title)}${file.ext}`;
        const dirKey = job.unit.tag ? `${slug}/${job.unit.tag}` : slug;
        const key = path.posix.join("documents", dirKey, base);
        const abs = path.join(UPLOADS, key);
        const thumbKey = path.posix.join("thumbnails", dirKey, `${base.replace(/\.[a-z0-9]+$/i, "")}.webp`);
        const thumbAbs = path.join(UPLOADS, thumbKey);

        try {
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, file.buf);

          let thumbMedia = null;
          if (file.ext === ".pdf") {
            fs.mkdirSync(path.dirname(thumbAbs), { recursive: true });
            try {
              if (await makeThumbnail(abs, thumbAbs)) {
                const thumbSize = fs.statSync(thumbAbs).size; // before upload: the s3 driver deletes the local copy
                const saved = await withRetry("thumbnail upload", () => storage().save({ path: thumbAbs, mimetype: "image/webp" }));
                thumbMedia = await Media.create({
                  filename: path.basename(thumbKey), originalName: path.basename(thumbKey),
                  key: saved.key, url: saved.url, mime: "image/webp", size: thumbSize,
                  alt: `Cover of ${job.doc.title}`,
                });
              }
            } catch (err) {
              console.log(`     ~ no cover for ${job.doc.title.slice(0, 46)}: ${err.message.slice(0, 50)}`);
            }
          }

          const savedFile = await withRetry("file upload", () => storage().save({ path: abs, mimetype: file.mime }));
          const fileMedia = await Media.create({
            filename: base, originalName: `${safe(job.doc.title)}${file.ext}`,
            key: savedFile.key, url: savedFile.url, mime: file.mime, size: file.buf.length,
            alt: job.doc.title,
          });

          const created = await Document.create({
            title: job.doc.title,
            slug: await uniqueSlug(Document, job.doc.title),
            category: category._id,
            file: fileMedia._id,
            thumbnail: thumbMedia?._id || null,
            tags: job.unit.tag ? [job.unit.tag] : [],
            status: "published",
            sourceHash: hash,
            sortOrder: 0,
          });
          byHash.set(hash, [...(byHash.get(hash) || []), { _id: created._id, title: job.doc.title, category: category._id, tags: job.unit.tag ? [job.unit.tag] : [] }]);
          results.push({ ...job, action: "add", target: { _id: created._id } });
          stats.add += 1;
          console.log(`   + ${job.doc.title.slice(0, 66)} (${(file.buf.length / 1024 / 1024).toFixed(1)}MB)`);
        } catch (err) {
          stats.failed += 1;
          failures.push(`${job.doc.title}: ${err.message.slice(0, 60)}`);
          console.log(`   ! ${job.doc.title.slice(0, 54)} — ${err.message.slice(0, 50)}`);
        } finally {
          await fs.promises.rm(abs, { force: true }).catch(() => {});
          await fs.promises.rm(thumbAbs, { force: true }).catch(() => {});
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // ---- assign positions in t-tel.org's order ----
    for (const job of jobs) {
      const r = results.find((x) => x.doc === job.doc);
      if (!r || !r.target?._id) continue;
      // every claimed document takes its live position, whether it was kept,
      // renamed or created — the position is the whole point of this pass
      const wanted = { sortOrder: pos };
      if (r.action === "rename") {
        wanted.title = job.doc.title;
        wanted.slug = await uniqueSlug(Document, job.doc.title, { ignoreId: r.target._id });
      }
      if (r.unit.tag) wanted.tags = [r.unit.tag];
      if (r.target.status && r.target.status !== "published") { wanted.status = "published"; stats.published += 1; }
      const changed = r.action !== "keep" || r.unit.tag || r.target.sortOrder !== pos || r.target.status !== "published";
      if (changed) {
        console.log(`   ${r.action === "add" ? "new " : r.action === "rename" ? "ren " : "ord "}${String(pos).padStart(3)}. ${job.doc.title.slice(0, 62)}`);
        if (!DRY) await Document.updateOne({ _id: r.target._id }, { $set: wanted });
      }
      pos += 1;
    }

    // ---- ours with no counterpart: keep them, after the matched ones ----
    const rest = await Document.find({
      category: category._id, deletedAt: null, _id: { $nin: [...claimed] },
    }).sort("title").select("_id title").lean();
    for (const d of rest) {
      if (!DRY) await Document.updateOne({ _id: d._id }, { $set: { sortOrder: pos } });
      pos += 1;
    }
    if (rest.length) console.log(`   + ${rest.length} of ours not on t-tel.org, sorted after them`);
    if (catUnits.some((u) => u.tag)) {
      const untagged = await Document.countDocuments({ category: category._id, deletedAt: null, tags: { $size: 0 } });
      if (untagged) console.log(`   ! ${untagged} document(s) here carry no tag group`);
    }
  }

  console.log(`\n${DRY ? "[dry run] " : ""}kept ${stats.keep}, renamed ${stats.rename}, added ${stats.add}, ` +
    `published ${stats.published}, withdrawn ${stats.withdrawn}, failed ${stats.failed}, ${(stats.bytes / 1024 / 1024).toFixed(0)}MB downloaded`);
  if (renamedLog.length) {
    console.log(`\n${renamedLog.length} rename(s):`);
    renamedLog.slice(0, 60).forEach((r) => console.log(`   [${r.slug}] ${r.from.slice(0, 52)}\n        -> ${r.to.slice(0, 66)}`));
    if (renamedLog.length > 60) console.log(`   … and ${renamedLog.length - 60} more`);
  }
  if (gaps.length) {
    console.log(`\n${gaps.length} document(s) t-tel.org cannot serve (nothing can be done about these):`);
    gaps.forEach((g) => console.log(`   [${g.slug}] ${g.title.slice(0, 66)}`));
  }
  if (failures.length) {
    console.log(`\n${failures.length} failure(s):`);
    failures.slice(0, 20).forEach((f) => console.log(`   ${f}`));
  }

  await disconnectDb();
}

main().catch(async (err) => { console.error(err); await disconnectDb(); process.exit(1); });

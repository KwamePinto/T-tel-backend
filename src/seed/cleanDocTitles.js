/**
 * Tidies ingested document titles in place.
 *
 *   node src/seed/cleanDocTitles.js [--dry]
 *
 * Source filenames carry workflow noise — "(ORIGINAL)", "copy", trailing
 * version numbers — that shouldn't show on the site. Titles are editable in
 * the dashboard, so this only removes what is unambiguously not part of a name.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Document } from "../models/index.js";

const DRY = process.argv.includes("--dry");

function clean(title) {
  let t = title;
  t = t.replace(/\(\s*original\s*\)/gi, "");
  t = t.replace(/\boriginal\b\s*$/gi, "");
  t = t.replace(/\bcopy(\s*\d+)?\s*$/gi, "");
  t = t.replace(/\bpt\s*(\d+)\b/gi, "Part $1");
  t = t.replace(/\bsem\s*(\d+)\b/gi, "Semester $1");
  t = t.replace(/\(\s*\)|\[\s*\]/g, "");
  t = t.replace(/\s{2,}/g, " ");
  t = t.replace(/\s+([,.;:)])/g, "$1");
  t = t.replace(/^[\s,.\-–]+|[\s,.\-–]+$/g, "").trim();
  return t || title;
}

await connectDb();

const docs = await Document.find({ sourceHash: { $ne: null } }).select("title").lean();
let changed = 0;
const samples = [];

for (const d of docs) {
  const next = clean(d.title);
  if (next === d.title) continue;
  changed++;
  if (samples.length < 12) samples.push(`${d.title}\n        -> ${next}`);
  if (!DRY) await Document.updateOne({ _id: d._id }, { $set: { title: next } });
}

console.log(`${DRY ? "[dry] " : ""}${changed} of ${docs.length} title(s) tidied`);
samples.forEach((s) => console.log("   " + s));

await disconnectDb();

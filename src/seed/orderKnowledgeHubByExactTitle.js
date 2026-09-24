/**
 * Final ordering pass over the Knowledge Hub: any document whose title is
 * character-for-character one of t-tel.org's takes that document's position.
 *
 *   node src/seed/orderKnowledgeHubByExactTitle.js <live.json> [--dry]
 *
 * alignKnowledgeHubDocuments.js does the hard part — pairing our documents
 * with theirs across differently-worded titles — but it deliberately drops
 * any pair whose edition is ambiguous (a tutor handbook against the
 * coordinator one). Some of those dropped documents already carry exactly
 * the right name, and were left sorted after the matched ones.
 *
 * This pass picks them up. It compares whole titles only, so it cannot
 * mislabel anything: a document either already has the live site's name, in
 * which case it takes the live site's position, or it doesn't and is left
 * alone after them.
 *
 * Safe to re-run.
 */
import fs from "node:fs";
import { connectDb, disconnectDb } from "../config/db.js";
import { Document, DocumentCategory } from "../models/index.js";

const DRY = process.argv.includes("--dry");
const FILE = process.argv.find((a) => a.endsWith(".json"));
const SKIP = new Set(["secondary-education"]);

async function main() {
  if (!FILE || !fs.existsSync(FILE)) throw new Error("Pass the scraped live list (JSON) as an argument.");
  const live = JSON.parse(fs.readFileSync(FILE, "utf8"));
  await connectDb();

  let moved = 0;
  for (const [slug, liveDocs] of Object.entries(live)) {
    if (SKIP.has(slug)) continue;
    const cat = await DocumentCategory.findOne({ slug });
    if (!cat) continue;

    const position = new Map();
    liveDocs.forEach((d, i) => { if (d.title && !position.has(d.title)) position.set(d.title, i + 1); });

    const ours = await Document.find({ category: cat._id, deletedAt: null })
      .sort("sortOrder title").select("title sortOrder").lean();

    const known = ours.filter((d) => position.has(d.title));
    const unknown = ours.filter((d) => !position.has(d.title));

    known.sort((a, b) => position.get(a.title) - position.get(b.title));

    let n = 0;
    for (const d of known) {
      n += 1;
      if (d.sortOrder !== n && !DRY) await Document.updateOne({ _id: d._id }, { $set: { sortOrder: n } });
      if (d.sortOrder !== n) moved += 1;
    }
    for (const d of unknown) {
      n += 1;
      if (d.sortOrder !== n && !DRY) await Document.updateOne({ _id: d._id }, { $set: { sortOrder: n } });
      if (d.sortOrder !== n) moved += 1;
    }
    console.log(`${slug}: ${known.length} in t-tel.org's order, ${unknown.length} after them`);
  }

  console.log(`\n${DRY ? "[dry run] " : ""}${moved} document(s) moved`);
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});

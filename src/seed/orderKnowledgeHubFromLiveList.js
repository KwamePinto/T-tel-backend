/**
 * Puts each Knowledge Hub section into t-tel.org's order, from the same live
 * listing syncKnowledgeHubWithLiveSite.js downloads from — but touching the
 * database only.
 *
 *   node src/seed/orderKnowledgeHubFromLiveList.js <sync-input.json> [--dry]
 *
 * The sync does names, files and order together; this is just the order, which
 * is the part that can always be redone offline. Useful when a run was
 * interrupted between downloading and positioning, or after adding documents
 * by hand, and as a way to re-apply t-tel.org's arrangement without pulling
 * anything down again.
 *
 * Positions run continuously across a collection's tag groups, so Secondary
 * Education's five groups keep their internal order whether a visitor filters
 * to one group or views the whole collection.
 *
 * Safe to re-run: a document already at the right position is left untouched.
 */
import fs from "node:fs";
import { connectDb, disconnectDb } from "../config/db.js";
import { Document, DocumentCategory } from "../models/index.js";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FILE = args.find((a) => a.endsWith(".json"));

async function main() {
  if (!FILE || !fs.existsSync(FILE)) throw new Error("Pass sync-input.json as an argument.");
  const units = JSON.parse(fs.readFileSync(FILE, "utf8"));
  await connectDb();

  // group by collection, preserving the order the units are listed in
  const byCategory = new Map();
  for (const u of units) {
    if (!byCategory.has(u.category)) byCategory.set(u.category, []);
    byCategory.get(u.category).push(u);
  }

  let moved = 0;
  const missing = [];

  for (const [slug, catUnits] of byCategory) {
    const category = await DocumentCategory.findOne({ slug });
    if (!category) { console.log(`! no collection ${slug}`); continue; }

    const ourDocs = await Document.find({ category: category._id, deletedAt: null })
      .select("_id title tags sortOrder").lean();
    const claimed = new Set();
    let pos = 1;

    for (const unit of catUnits) {
      let placed = 0, absent = 0;
      for (const live of unit.docs) {
        // take the next unclaimed document of ours in this collection carrying
        // exactly this title — and this group's tag, where the unit is grouped
        const match = ourDocs.find((d) =>
          !claimed.has(String(d._id)) &&
          d.title === live.title &&
          (!unit.tag || (d.tags || []).includes(unit.tag)));
        if (!match) { absent += 1; missing.push({ slug: unit.key, title: live.title }); continue; }
        claimed.add(String(match._id));
        if (match.sortOrder !== pos) {
          moved += 1;
          if (!DRY) await Document.updateOne({ _id: match._id }, { $set: { sortOrder: pos } });
        }
        pos += 1;
        placed += 1;
      }
      console.log(`   ${unit.key.padEnd(56)} positioned ${String(placed).padStart(3)}/${String(unit.docs.length).padStart(3)}${absent ? `  (${absent} not held)` : ""}`);
    }

    // whatever is left of ours — documents t-tel.org doesn't list — follows on
    const rest = ourDocs.filter((d) => !claimed.has(String(d._id))).sort((a, b) => a.title.localeCompare(b.title));
    for (const d of rest) {
      if (d.sortOrder !== pos && !DRY) await Document.updateOne({ _id: d._id }, { $set: { sortOrder: pos } });
      if (d.sortOrder !== pos) moved += 1;
      pos += 1;
    }
    if (rest.length) console.log(`   ${slug}: ${rest.length} of ours not on t-tel.org, positioned after them`);
  }

  console.log(`\n${DRY ? "[dry run] " : ""}${moved} document(s) repositioned`);
  const grouped = {};
  for (const m of missing) grouped[m.slug] = (grouped[m.slug] || 0) + 1;
  const entries = Object.entries(grouped);
  if (entries.length) {
    console.log(`\n${missing.length} live document(s) not held, so left out of the order:`);
    entries.forEach(([k, n]) => console.log(`   ${k}: ${n}`));
  }
  await disconnectDb();
}

main().catch(async (err) => { console.error(err); await disconnectDb(); process.exit(1); });

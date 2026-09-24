/**
 * Puts each Knowledge Hub collection's documents into t-tel.org's order, under
 * t-tel.org's names.
 *
 *   node src/seed/alignKnowledgeHubDocuments.js --dry
 *   node src/seed/alignKnowledgeHubDocuments.js
 *
 * Reads a match plan produced by the scratch matcher (scratchpad/pw): for each
 * collection, the live site's list in order, paired with the document of ours
 * it corresponds to. Pairing is on normalised tokens, because the two sets came
 * from different places and word them differently — "Arabic Course Manual Year
 * 2 Semester 1" here against "…Year 2 Sem 1" there. Tutor/Coordinator and the
 * year/semester numbers had to agree exactly for a pair to be accepted, so a
 * tutor handbook can't end up labelled as the coordinator edition.
 *
 * Matched documents take the live title and sortOrder 1..N in the live order,
 * so the top of every list reads exactly as it does on t-tel.org. Anything of
 * ours with no counterpart there keeps its title and sorts after them, rather
 * than being hidden or deleted.
 *
 * Secondary Education is deliberately skipped: the live site splits it across
 * four pages, which this site models as one collection with four tag groups
 * (see tagSecondaryGroups.js), and flattening it against the first of those
 * pages would undo that.
 *
 * Safe to re-run: it writes titles and sort orders from the plan, so a second
 * run is a no-op.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDb, disconnectDb } from "../config/db.js";
import { Document, DocumentCategory } from "../models/index.js";

const DRY = process.argv.includes("--dry");
const HERE = path.dirname(fileURLToPath(import.meta.url));

const PLAN_FILE = process.argv.find((a) => a.endsWith(".json"))
  || path.resolve(HERE, "..", "..", "..", "match-plan.json");

const SKIP = new Set(["secondary-education"]);

async function main() {
  if (!fs.existsSync(PLAN_FILE)) {
    throw new Error(`No match plan at ${PLAN_FILE} — pass its path as an argument.`);
  }
  const plan = JSON.parse(fs.readFileSync(PLAN_FILE, "utf8"));
  await connectDb();

  let renamed = 0;
  let reordered = 0;

  for (const [slug, matches] of Object.entries(plan)) {
    if (SKIP.has(slug)) {
      console.log(`${slug}: skipped (four tag groups, see the header)`);
      continue;
    }
    const cat = await DocumentCategory.findOne({ slug });
    if (!cat) {
      console.log(`${slug}: no such collection`);
      continue;
    }

    const total = await Document.countDocuments({ category: cat._id, deletedAt: null });
    console.log(`\n${slug}: ${matches.length} of ${total} matched to t-tel.org`);

    const matchedIds = new Set();
    for (const m of matches) {
      matchedIds.add(m.ourId);
      const doc = await Document.findById(m.ourId).select("title sortOrder").lean();
      if (!doc) continue;

      const wantsRename = doc.title !== m.liveTitle;
      const wantsOrder = doc.sortOrder !== m.position;
      if (wantsRename) renamed += 1;
      if (wantsOrder) reordered += 1;
      if (wantsRename) console.log(`   ${String(m.position).padStart(3)}. ${doc.title}\n        -> ${m.liveTitle}`);

      if (!DRY) {
        await Document.updateOne(
          { _id: m.ourId },
          { $set: { title: m.liveTitle, sortOrder: m.position } },
        );
      }
    }

    // ours with no counterpart on the live site keep their names and follow on
    const rest = await Document.find({ category: cat._id, deletedAt: null })
      .sort("title")
      .select("_id title")
      .lean();
    let next = matches.length + 1;
    for (const d of rest) {
      if (matchedIds.has(String(d._id))) continue;
      if (!DRY) await Document.updateOne({ _id: d._id }, { $set: { sortOrder: next } });
      next += 1;
    }
    const extras = next - matches.length - 1;
    if (extras) console.log(`   + ${extras} of ours not on t-tel.org, sorted after them`);
  }

  console.log(`\n${DRY ? "[dry run] " : ""}${renamed} renamed, ${reordered} reordered`);
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});

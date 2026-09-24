/**
 * Brings the Knowledge Hub's collections into line with t-tel.org.
 *
 *   node src/seed/alignKnowledgeHubToLiveSite.js --dry
 *   node src/seed/alignKnowledgeHubToLiveSite.js
 *
 * The live site's Knowledge Hub menu is, in order:
 *
 *   Teacher Education
 *     B.Ed. Resources
 *     Impact, Learning & Good Practice
 *     College Leadership & Management
 *     Teacher Education Policy & Institutional Development
 *   Basic Education
 *   Secondary Education
 *   T-TEL Reports & Publications
 *
 * There is no TVET collection there. Ours had one, holding 19 documents that
 * are B.Ed. course materials by name and shape — "Year 2 Semester 1 TVET
 * Tutor", "Y4 TVET Coordinator Version" — the same Year/Semester +
 * Tutor/Coordinator/PDC pattern as the rest of B.Ed. Resources, and nothing
 * like Basic Education's PLC school handbooks. So they move to B.Ed.
 * Resources and the empty collection is removed.
 *
 * The collection is deleted outright rather than soft-deleted: the public
 * /document-collections route doesn't filter on deletedAt, so a soft delete
 * would leave it on the site.
 *
 * Policies is left where it is. It isn't part of the live site's Knowledge
 * Hub menu — it backs the About Us > Our Policies page — so it keeps its
 * place at the end rather than being reordered against a list it isn't on.
 *
 * Safe to re-run: once the documents have moved and the collection is gone,
 * a second run finds nothing to do and only rewrites the sort order, which
 * is already correct.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Document, DocumentCategory } from "../models/index.js";

const DRY = process.argv.includes("--dry");

/** Top-level collections, in the live site's order. */
const TOP_LEVEL_ORDER = [
  "teacher-education",
  "basic-education",
  "secondary-education",
  "reports-and-publications",
  "policies", // not in the live menu; kept last so it has a defined place
];

/** Children of Teacher Education, in the live site's order. */
const TEACHER_EDUCATION_ORDER = [
  "bed-resources",
  "impact-learning-and-good-practice",
  "college-leadership-and-management",
  "teacher-education-policy-and-institutional-development",
];

async function main() {
  await connectDb();

  const tvet = await DocumentCategory.findOne({ slug: "tvet" });
  const bed = await DocumentCategory.findOne({ slug: "bed-resources" });
  if (!bed) throw new Error("No bed-resources collection — refusing to move anything.");

  // ---- 1. TVET's documents move to B.Ed. Resources ----
  if (tvet) {
    const docs = await Document.find({ category: tvet._id, deletedAt: null }).select("title").lean();
    console.log(`TVET -> B.Ed. Resources: ${docs.length} document(s)`);
    for (const d of docs) console.log(`   ${d.title}`);

    if (!DRY && docs.length) {
      // sortOrder 0 like every other B.Ed. document, so they interleave by
      // title rather than being pinned to the end of a 200-item list
      await Document.updateMany(
        { category: tvet._id },
        { $set: { category: bed._id, sortOrder: 0 } },
      );
    }

    // ---- 2. the empty collection goes ----
    const left = DRY ? 0 : await Document.countDocuments({ category: tvet._id });
    if (left) {
      console.log(`   ! ${left} document(s) still on TVET — leaving the collection in place`);
    } else {
      console.log(`removing the TVET collection${DRY ? " (dry run)" : ""}`);
      if (!DRY) await DocumentCategory.deleteOne({ _id: tvet._id });
    }
  } else {
    console.log("No TVET collection — already removed.");
  }

  // ---- 3. the order the live site lists them in ----
  console.log("\norder:");
  const teacherEd = await DocumentCategory.findOne({ slug: "teacher-education" });

  for (const [i, slug] of TOP_LEVEL_ORDER.entries()) {
    const cat = await DocumentCategory.findOne({ slug });
    if (!cat) {
      console.log(`   ! ${slug} is missing`);
      continue;
    }
    const next = i + 1;
    console.log(`   ${next}. ${cat.name}${cat.sortOrder === next ? "" : `  (was ${cat.sortOrder})`}`);
    if (!DRY) await DocumentCategory.updateOne({ _id: cat._id }, { $set: { sortOrder: next } });
  }

  if (teacherEd) {
    for (const [i, slug] of TEACHER_EDUCATION_ORDER.entries()) {
      const cat = await DocumentCategory.findOne({ slug });
      if (!cat) {
        console.log(`      ! ${slug} is missing`);
        continue;
      }
      const next = i + 1;
      console.log(`      ${next}. ${cat.name}${cat.sortOrder === next ? "" : `  (was ${cat.sortOrder})`}`);
      if (!DRY) {
        await DocumentCategory.updateOne(
          { _id: cat._id },
          { $set: { sortOrder: next, parent: teacherEd._id } },
        );
      }
    }
  }

  console.log(`\n${DRY ? "[dry run] nothing written" : "done"}`);
  console.log("Next: node src/seed/rebuildKnowledgeHubNav.js — rebuilds the menu from this tree.");
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});

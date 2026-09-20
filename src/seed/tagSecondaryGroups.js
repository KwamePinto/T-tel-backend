/**
 * Files every Secondary Education document into one of the four groups the
 * page offers as filters, by writing a tag onto each document:
 *
 *   node src/seed/tagSecondaryGroups.js [--dry]
 *
 * The groups come from the live site, which splits the same collection across
 * four pages. Our titles were normalised at ingest and lost the qualifiers
 * ("Physics" rather than "Physics Teacher Manual (Year 1)"), so the grouping
 * reads the uploaded file's original name, which kept them.
 *
 * Safe to re-run: it only ever rewrites this set of tags, so a document an
 * editor has since re-tagged by hand keeps whatever else is on it.
 */
import mongoose from "mongoose";
import { connectDb } from "../config/db.js";
import { Document, DocumentCategory } from "../models/index.js";

const DRY = process.argv.includes("--dry");

export const SECONDARY_GROUPS = [
  { tag: "departmental-plc-handbooks", label: "Departmental PLC Handbooks" },
  { tag: "teacher-manuals-y1-book-1", label: "Teacher Manuals Year 1 Book 1" },
  { tag: "teacher-manuals-y1-book-2", label: "Teacher Manuals Year 1 Book 2" },
  { tag: "subject-specific-plc-handbooks", label: "Subject-Specific PLC Handbooks" },
];

const TAGS = SECONDARY_GROUPS.map((g) => g.tag);

/** Whole-department material: standards, leadership, the numbered handbooks. */
const DEPARTMENTAL =
  /professional[ _-]*learning[ _-]*community|national[ _-]*teachers|national[ _-]*values|^leading|building[ _-]*and[ _-]*leading|annex[ _-]*16|teacher[ _-]*assessment|leadership[ _-]*training|plc[ _-]*handbook[ _-]*\d/i;

// "Year 1 Bk 2", "year-1-BK-2", "(Year 1 Book 2)" — the same book, spelled
// a dozen ways across two years of uploads
const BOOK_TWO = /b(oo)?k[ _-]*2/i;

// "PLC Handbook_Physics_Year 1", "PLC-Handbook_Economics"
const SUBJECT_PLC = /^plc[ _-]?handbook/i;

export function groupFor(name) {
  const n = String(name || "");
  if (DEPARTMENTAL.test(n)) return "departmental-plc-handbooks";
  if (BOOK_TWO.test(n)) return "teacher-manuals-y1-book-2";
  if (SUBJECT_PLC.test(n)) return "subject-specific-plc-handbooks";
  // everything else is a Year 1 Book 1 manual, which is how most of them
  // arrived: a bare subject name, "Physics.pdf"
  return "teacher-manuals-y1-book-1";
}

async function main() {
  await connectDb();

  const category = await DocumentCategory.findOne({ slug: "secondary-education" }).lean();
  if (!category) {
    console.error("No secondary-education collection — nothing to tag.");
    process.exit(1);
  }

  const docs = await Document.find({ category: category._id, deletedAt: null })
    .populate("file", "originalName")
    .lean();

  const counts = {};
  let changed = 0;

  for (const doc of docs) {
    const name = doc.file?.originalName || doc.title || "";
    const tag = groupFor(name);
    counts[tag] = (counts[tag] || 0) + 1;

    // keep any tag an editor added, replace only the group we own
    const kept = (doc.tags || []).filter((t) => !TAGS.includes(t));
    const next = [...kept, tag];
    if (JSON.stringify(next) === JSON.stringify(doc.tags || [])) continue;

    changed++;
    if (!DRY) await Document.updateOne({ _id: doc._id }, { $set: { tags: next } });
  }

  console.log(`${docs.length} document(s) in Secondary Education${DRY ? "  [dry run]" : ""}`);
  for (const g of SECONDARY_GROUPS) {
    console.log(`   ${String(counts[g.tag] || 0).padStart(4)}  ${g.label}`);
  }
  console.log(`${changed} document(s) ${DRY ? "would be" : ""} updated`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

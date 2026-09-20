/**
 * Gives TVET its own Knowledge Hub collection and moves the TVET-titled
 * documents into it from B.Ed. Resources, where they were filed generically.
 *
 *   node src/seed/addTvetCollection.js [--dry]
 *
 * Safe to re-run: creating the collection is an upsert, and a document
 * already filed under TVET is left alone.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Document, DocumentCategory } from "../models/index.js";

const DRY = process.argv.includes("--dry");

await connectDb();

const tvet = await DocumentCategory.findOneAndUpdate(
  { slug: "tvet" },
  { $set: { name: "TVET", sortOrder: 4, parent: null } },
  { new: true, upsert: true },
);
console.log(`collection ready: ${tvet.name} (${tvet._id})`);

// every document whose title says TVET, wherever it's currently filed
const candidates = await Document.find({
  title: /tvet/i,
  category: { $ne: tvet._id },
  deletedAt: null,
}).select("title category");

console.log(`${candidates.length} document(s) to move:`);
for (const doc of candidates) console.log(`   ${doc.title}`);

if (!DRY) {
  const ids = candidates.map((d) => d._id);
  await Document.updateMany({ _id: { $in: ids } }, { $set: { category: tvet._id } });
  console.log(`moved ${ids.length} document(s) into TVET`);
} else {
  console.log("[dry run] nothing written");
}

await disconnectDb();

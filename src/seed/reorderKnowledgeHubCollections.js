/**
 * Reorders the Knowledge Hub collections: Basic Education, Secondary
 * Education, TVET, Teacher Education, T-TEL Reports & Publications.
 *
 *   node src/seed/reorderKnowledgeHubCollections.js
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { DocumentCategory } from "../models/index.js";
import { DOCUMENT_COLLECTION_TREE } from "./defaults.js";

await connectDb();

for (const top of DOCUMENT_COLLECTION_TREE) {
  await DocumentCategory.updateOne({ slug: top.slug }, { $set: { sortOrder: top.sortOrder } });
  console.log(`   ${top.name.padEnd(30)} sortOrder ${top.sortOrder}`);
}

await disconnectDb();

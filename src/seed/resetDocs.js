/**
 * Clears ingested Knowledge Hub documents so the ingest can be re-run clean.
 *
 *   node src/seed/resetDocs.js
 *
 * Only touches records the ingest created (those carrying a sourceHash) and
 * the files under uploads/documents and uploads/thumbnails.
 */
import fs from "node:fs";
import path from "node:path";
import { env, ROOT } from "../config/env.js";
import { connectDb, disconnectDb } from "../config/db.js";
import { Document, Media } from "../models/index.js";

await connectDb();

const ingested = await Document.find({ sourceHash: { $ne: null } }).select("file thumbnail").lean();
const mediaIds = ingested.flatMap((d) => [d.file, d.thumbnail]).filter(Boolean);

const { deletedCount: docs } = await Document.deleteMany({ sourceHash: { $ne: null } });
const { deletedCount: media } = await Media.deleteMany({ _id: { $in: mediaIds } });

const UPLOADS = path.resolve(ROOT, env.uploadDir || "uploads");
for (const dir of ["documents", "thumbnails"]) {
  const p = path.join(UPLOADS, dir);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log(`  removed ${p}`);
  }
}

console.log(`  deleted ${docs} document(s) and ${media} media record(s)`);
await disconnectDb();

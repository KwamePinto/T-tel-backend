/**
 * Clones every collection, document and index from one MongoDB database to
 * another — developer's Atlas cluster to the client's.
 *
 *   node handover/clone-database.mjs --dry           show what would happen
 *   node handover/clone-database.mjs                 clone (refuses if the
 *                                                     destination isn't empty)
 *   node handover/clone-database.mjs --drop           wipe each destination
 *                                                     collection first, then clone
 *
 * Reads its configuration from handover/.env (see handover/.env.example) —
 * SOURCE_MONGO_URI / SOURCE_DB_NAME and DEST_MONGO_URI / DEST_DB_NAME. These
 * are deliberately separate from the application's own MONGO_URI, because
 * this script needs to see both databases in the same run.
 *
 * Uses the MongoDB driver directly rather than the app's Mongoose models, so
 * it clones exactly what is stored — collections the schema doesn't know
 * about, fields an older schema version left behind, everything — without
 * needing to be kept in sync with the app's models as they evolve.
 *
 * Safety: by default the script REFUSES to touch a destination collection
 * that already has documents in it, so running it twice by accident cannot
 * silently duplicate or overwrite data. Pass --drop to explicitly wipe and
 * replace — only do this once, as the very last step before going live, and
 * only if you are certain the client's database has nothing in it worth
 * keeping (see handover/README.md).
 *
 * What this does NOT do: copy any files. Documents and PDFs live in R2, not
 * in MongoDB (this app has no GridFS), so uploads are handled entirely by
 * migrate-r2-bucket.mjs. Run that one too.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { config as loadEnv } from "dotenv";

const HERE = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(HERE, ".env"), override: true });

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const DROP = args.includes("--drop");
const BATCH = 500;

function need(key) {
  const value = process.env[key];
  if (!value) {
    console.error(`Missing ${key}. Copy handover/.env.example to handover/.env and fill it in.`);
    process.exit(1);
  }
  return value;
}

const SRC_URI = need("SOURCE_MONGO_URI");
const SRC_DB = process.env.SOURCE_DB_NAME || "ttel";
const DST_URI = need("DEST_MONGO_URI");
const DST_DB = process.env.DEST_DB_NAME || "ttel";

if (SRC_URI === DST_URI && SRC_DB === DST_DB) {
  console.error("Source and destination are the same database — refusing to run.");
  process.exit(1);
}

/** Recreates a source index definition on the destination collection. */
async function copyIndexes(srcCol, dstCol, name) {
  const indexes = await srcCol.indexes();
  let made = 0;
  for (const idx of indexes) {
    if (idx.name === "_id_") continue; // every collection already has this one
    const { key, name: idxName, ...options } = idx;
    // "v" is the index format version Mongo itself assigns — not ours to set
    delete options.v;
    try {
      if (!DRY) await dstCol.createIndex(key, { name: idxName, ...options });
      made++;
    } catch (err) {
      console.log(`     ! index "${idxName}" on ${name}: ${err.message.slice(0, 90)}`);
    }
  }
  return made;
}

async function cloneCollection(srcDb, dstDb, name) {
  const srcCol = srcDb.collection(name);
  const dstCol = dstDb.collection(name);

  const sourceCount = await srcCol.countDocuments();
  const destCount = await dstCol.countDocuments();

  if (destCount > 0 && !DROP) {
    console.log(`  ! ${name}: destination already has ${destCount} document(s) — skipped (pass --drop to replace)`);
    return { name, sourceCount, written: 0, skipped: true };
  }

  console.log(`  ${name}: ${sourceCount} document(s)${DROP && destCount ? ` (replacing ${destCount})` : ""}`);
  if (DRY) return { name, sourceCount, written: sourceCount, skipped: false };

  if (DROP && destCount > 0) await dstCol.deleteMany({});

  let written = 0;
  const cursor = srcCol.find({}, { batchSize: BATCH });
  let batch = [];
  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= BATCH) {
      await dstCol.insertMany(batch, { ordered: false });
      written += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await dstCol.insertMany(batch, { ordered: false });
    written += batch.length;
  }

  const indexesMade = await copyIndexes(srcCol, dstCol, name);
  console.log(`     wrote ${written}, ${indexesMade} index(es)`);

  return { name, sourceCount, written, skipped: false };
}

async function main() {
  console.log(`[db-clone] source      ${SRC_DB}`);
  console.log(`[db-clone] destination ${DST_DB}${DROP ? "  (--drop: destination will be replaced)" : ""}${DRY ? "  [dry run]" : ""}\n`);

  const srcClient = await MongoClient.connect(SRC_URI);
  const dstClient = await MongoClient.connect(DST_URI);
  const srcDb = srcClient.db(SRC_DB);
  const dstDb = dstClient.db(DST_DB);

  const collections = (await srcDb.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith("system."))
    .sort();

  if (!collections.length) {
    console.error("Source database has no collections — check SOURCE_MONGO_URI / SOURCE_DB_NAME.");
    process.exit(1);
  }

  const results = [];
  for (const name of collections) {
    results.push(await cloneCollection(srcDb, dstDb, name));
  }

  await srcClient.close();
  await dstClient.close();

  const skipped = results.filter((r) => r.skipped);
  const totalWritten = results.reduce((n, r) => n + r.written, 0);
  const totalSource = results.reduce((n, r) => n + r.sourceCount, 0);

  console.log(`\n[db-clone] ${collections.length} collection(s), ${totalWritten}/${totalSource} document(s) ${DRY ? "would be " : ""}written`);
  if (skipped.length) {
    console.log(`[db-clone] ${skipped.length} collection(s) left untouched — destination was not empty: ${skipped.map((s) => s.name).join(", ")}`);
  }
  if (!DRY && !skipped.length) {
    console.log("\nNext: run migrate-r2-bucket.mjs (if not already done), then verify the client's site against its own database.");
  }
}

main().catch((err) => {
  console.error("\n[db-clone] failed:", err);
  process.exit(1);
});

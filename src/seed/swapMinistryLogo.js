/**
 * Swaps the Ministry of Education partner's logo for the file the client
 * dropped into ttel-frontend/public/images/logos/.
 *
 *   node src/seed/swapMinistryLogo.js --dry
 *   node src/seed/swapMinistryLogo.js
 *
 * Only the logo changes — name, description and its French translation are
 * left exactly as they are. The old logo file is left in the bucket rather
 * than deleted (unlike trimPartnerLogos.js's own rewrites, this isn't a
 * like-for-like crop of the same asset, so there's no reason to be as sure
 * nothing else could be pointing at it).
 *
 * Run trimPartnerLogos.js afterwards, same as addGovernmentAgencies.js —
 * this doesn't crop anything itself.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { connectDb, disconnectDb } from "../config/db.js";
import { env } from "../config/env.js";
import { storage } from "../services/storage.js";
import { Media, Partner } from "../models/index.js";

const DRY = process.argv.includes("--dry");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = path.resolve(HERE, "..", "..", "..", "ttel-frontend", "public", "images", "logos");
const SOURCE_FILE = "MoE_GoG_logo_no_background_with_strap[62].png";

async function main() {
  await connectDb();

  const partner = await Partner.findOne({ slug: "ministry-of-education" }).populate("logo");
  if (!partner) throw new Error('No partner with slug "ministry-of-education" — nothing to swap.');

  const source = path.join(LOGOS_DIR, SOURCE_FILE);
  if (!fs.existsSync(source)) throw new Error(`logo not found: ${source}`);

  const buffer = await sharp(source)
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const metadata = await sharp(buffer).metadata();
  const key = "images/partners/ministry-of-education.png";
  const absolute = path.join(env.uploadDir, key);

  console.log(`  ${partner.name}`);
  console.log(`     old logo: ${partner.logo?.key} (${partner.logo?.width}x${partner.logo?.height})`);
  console.log(`     new logo: ${SOURCE_FILE} -> ${key} (${metadata.width}x${metadata.height})`);

  if (DRY) {
    await disconnectDb();
    return;
  }

  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, buffer);
  const saved = await storage().save({ path: absolute, mimetype: "image/png" });

  const media = await Media.create({
    filename: path.basename(saved.key),
    originalName: SOURCE_FILE,
    key: saved.key,
    url: saved.url,
    mime: "image/png",
    size: buffer.length,
    width: metadata.width,
    height: metadata.height,
    alt: partner.name,
  });

  await Partner.updateOne({ _id: partner._id }, { $set: { logo: media._id } });

  console.log(`     swapped. Old media record ${partner.logo?._id} left in place, unreferenced.`);
  console.log("Next: node src/seed/trimPartnerLogos.js — crops the new logo to a consistent size.");

  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});

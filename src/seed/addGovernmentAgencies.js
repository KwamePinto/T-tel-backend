/**
 * Adds five government-agency partners under Our Partners, with the logos
 * the client dropped into ttel-frontend/public/images/logos/.
 *
 *   node src/seed/addGovernmentAgencies.js --dry
 *   node src/seed/addGovernmentAgencies.js
 *
 * Each logo is copied through the configured storage driver (local disk or
 * R2, whichever STORAGE_DRIVER is set to) as a Media record, then a Partner
 * record is upserted by slug pointing at it — safe to re-run, an existing
 * record is updated in place rather than duplicated.
 *
 * Sizing/uniformity: this does not itself crop or resize anything. Run
 * trimPartnerLogos.js afterwards — it tightens every partner's logo to its
 * own ink (removing whatever margin the source file happened to be
 * exported with), which is what actually gives every mark on the page a
 * consistent visual weight; sitting all of them in the same CSS box alone
 * isn't enough when one file is a tight wordmark and another is a badge
 * with wide empty padding.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { connectDb, disconnectDb } from "../config/db.js";
import { env } from "../config/env.js";
import { storage } from "../services/storage.js";
import { toSlug } from "../utils/slug.js";
import { Media, Partner } from "../models/index.js";

const DRY = process.argv.includes("--dry");
const HERE = path.dirname(fileURLToPath(import.meta.url));

// the two repos are checked out as siblings on disk in development; on a
// single-repo deploy this won't exist and the script says so rather than
// failing on a confusing fs error
const LOGOS_DIR = path.resolve(HERE, "..", "..", "..", "ttel-frontend", "public", "images", "logos");

const AGENCIES = [
  {
    name: "Ghana Education Service (GES)",
    file: "GES_logo.png",
    description:
      "GES is the government agency responsible for delivering pre-tertiary education across the country, " +
      "managing schools, teachers and learning outcomes nationwide. T-TEL supports GES's priorities around " +
      "teacher quality and professional development, helping strengthen the systems that get good teaching " +
      "into every classroom.",
  },
  {
    name: "National Council for Curriculum and Assessment (NaCCA)",
    file: "NaCCA_Logo.jpg.jpeg",
    description:
      "T-TEL supports NaCCA in translating curriculum reform into practice, helping teachers and tutors " +
      "understand and apply new standards through training, resource development and communication " +
      "campaigns. This support has been central to major rollouts such as the Senior High School curriculum " +
      "reform.",
  },
  {
    name: "National Schools Inspectorate Authority (NaSIA)",
    file: "NaSIA.jpeg",
    description:
      "T-TEL supports NaSIA to align teacher development with national quality standards, ensuring that " +
      "improvements in classroom practice are reflected in how schools are assessed and monitored. This " +
      "helps connect training investment to measurable gains in school quality.",
  },
  {
    name: "Centre for National Distance Learning and Open Schooling (CENDLOS)",
    file: "cendlos.png",
    description:
      "T-TEL supports CENDLOS to extend teacher training and learning resources beyond the classroom, " +
      "drawing on distance and open learning approaches to reach educators in every part of the country.",
  },
  {
    name: "West African Examinations Council (WAEC)",
    file: "WAEC-Logo2.png",
    description:
      "T-TEL supports WAEC's work by ensuring that improvements in teaching and curriculum delivery are " +
      "reflected in learner assessment, strengthening alignment between classroom practice and national " +
      "examination standards.",
  },
  // National Teaching Council (NTC) was in the brief but has no logo file in
  // ttel-frontend/public/images/logos — add one there and add an entry here
  // (same shape as the others) rather than publishing this one without a mark.
];

async function saveLogo(file, agencyName) {
  const source = path.join(LOGOS_DIR, file);
  if (!fs.existsSync(source)) throw new Error(`logo not found: ${source}`);

  // normalised to PNG so every partner's logo is served the same format.
  // sharp flattens nothing here — transparency is kept where the source has
  // it, trimPartnerLogos.js is what removes dead space. The 1600px cap is
  // only a safety net against an oversized source export (one of these
  // arrived at 1280x1219, ~1MB) — the real sizing pass is trimPartnerLogos.js.
  const buffer = await sharp(source)
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const metadata = await sharp(buffer).metadata();
  const key = path.posix.join("images", "partners", `${toSlug(agencyName)}.png`);
  const absolute = path.join(env.uploadDir, key);

  if (DRY) return { key, width: metadata.width, height: metadata.height, size: buffer.length };

  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, buffer);
  const saved = await storage().save({ path: absolute, mimetype: "image/png" });

  return Media.findOneAndUpdate(
    { key: saved.key },
    {
      $set: {
        filename: path.basename(saved.key),
        originalName: file,
        key: saved.key,
        url: saved.url,
        mime: "image/png",
        size: buffer.length,
        width: metadata.width,
        height: metadata.height,
      },
    },
    { upsert: true, new: true },
  );
}

async function main() {
  await connectDb();

  const existing = await Partner.find({ groups: "government", deletedAt: null }).sort("-sortOrder").limit(1).lean();
  let nextOrder = (existing[0]?.sortOrder ?? -10) + 10;

  let created = 0;
  let updated = 0;

  for (const agency of AGENCIES) {
    const slug = toSlug(agency.name);
    const logo = await saveLogo(agency.file, agency.name);
    const found = await Partner.findOne({ slug }).lean();

    console.log(`  ${agency.name}`);
    console.log(`     logo: ${agency.file} -> ${logo.key} (${logo.width}x${logo.height})`);
    console.log(`     ${found ? "update" : "create"}, sortOrder ${found?.sortOrder ?? nextOrder}`);

    if (DRY) {
      if (!found) nextOrder += 10;
      continue;
    }

    if (found) {
      await Partner.updateOne(
        { _id: found._id },
        {
          $set: {
            name: agency.name,
            description: agency.description,
            logo: logo._id,
            groups: [...new Set([...(found.groups || []), "government"])],
          },
        },
      );
      updated++;
    } else {
      await Partner.create({
        name: agency.name,
        slug,
        groups: ["government"],
        logo: logo._id,
        description: agency.description,
        showOnHome: false,
        sortOrder: nextOrder,
      });
      nextOrder += 10;
      created++;
    }
  }

  console.log(
    `\n${DRY ? "[dry run] " : ""}${created} created, ${updated} updated. ` +
      "National Teaching Council (NTC) was not added — no logo file was provided for it.",
  );
  console.log("Next: node src/seed/trimPartnerLogos.js — tightens every partner logo to a consistent crop.");

  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});

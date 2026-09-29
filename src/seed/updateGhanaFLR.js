/**
 * Replaces "Ghana Foundational Learning Reform Phase 1"'s content with the
 * client's own Ghana_Foundational_Learning_Reform.docx, and uploads its 15
 * embedded photographs to the Media library — unlike the two docs used
 * earlier for Teaching Innovation Lab/STS Research, this one actually
 * contains real photos, extracted directly from the docx's own media
 * folder (no re-download from anywhere needed).
 *
 * 4 of the 15 are used directly in the post (1 as featuredImage, 3 as
 * inline "split" blocks alongside the narrative); all 15 are uploaded to
 * Media regardless, so the rest are available to swap in later.
 *
 *   node src/seed/updateGhanaFLR.js [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import sharp from "sharp";
import { connectDb, disconnectDb } from "../config/db.js";
import { env } from "../config/env.js";
import { Post, Media } from "../models/index.js";

const DRY = process.argv.includes("--dry");
// The docx's own media folder, unzipped to the scratchpad for this one run —
// not re-runnable as-is later without re-extracting
// Ghana_Foundational_Learning_Reform.docx (it's a zip; `word/media/*` inside
// it holds these same 15 files) to this same path first.
const MEDIA_DIR = "C:/Users/user/AppData/Local/Temp/docx4/word/media";
const MEDIA_BASE = "https://pub-c79e6670d04e48dbb55e63d5171ea153.r2.dev";

// Same fresh-agent workaround as fixBrokenBlogImages.js — a plain
// storage().save() here reliably gets a garbled response on this network,
// traced to Node's default HTTPS agent reusing a keep-alive socket opened
// for MongoDB's own TLS connection.
async function uploadToR2(localPath, mimetype) {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { NodeHttpHandler } = await import("@smithy/node-http-handler");
  const client = new S3Client({
    region: env.s3.region || "auto",
    endpoint: env.s3.endpoint,
    credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
    forcePathStyle: true,
    requestHandler: new NodeHttpHandler({ httpsAgent: new https.Agent({ keepAlive: false }) }),
  });
  const key = path.relative(env.uploadDir, localPath).split(path.sep).join("/");
  await client.send(new PutObjectCommand({
    Bucket: env.s3.bucket, Key: key, Body: fs.readFileSync(localPath),
    ContentType: mimetype, CacheControl: "public, max-age=2592000",
  }));
  return { key, url: `/uploads/${key}` };
}

async function withRetry(label, fn, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === tries) throw err;
      console.log(`  ! ${label} failed (attempt ${i}/${tries}): ${err.message} — retrying`);
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

async function uploadPhoto(filename, alt) {
  const localPath = path.join(MEDIA_DIR, filename);
  const { width, height } = await sharp(localPath).metadata();

  if (DRY) {
    console.log(`  [dry] would upload ${filename} (${width}x${height})`);
    return { _id: null, url: "/uploads/dry", width, height };
  }

  // stage a copy under env.uploadDir so uploadToR2's relative-key derivation
  // matches the convention every other upload uses
  const stageDir = path.join(env.uploadDir, "ghana-flr");
  fs.mkdirSync(stageDir, { recursive: true });
  const staged = path.join(stageDir, filename);
  fs.copyFileSync(localPath, staged);

  const saved = await withRetry(`upload ${filename}`, () => uploadToR2(staged, "image/jpeg"));
  fs.rmSync(staged, { force: true });

  const media = await Media.create({
    filename: path.basename(saved.key),
    originalName: filename,
    key: saved.key,
    url: saved.url,
    mime: "image/jpeg",
    size: fs.statSync(localPath).size,
    alt,
    width,
    height,
  });
  console.log(`  uploaded ${filename} (${width}x${height}) -> ${media._id}`);
  return media;
}

const ASIDE =
  "<ul><li><strong>Project Duration</strong><br>1 June 2026 to 31 August 2027</li>" +
  "<li><strong>Partners</strong><br>Ministry of Education, Ghana Education Service, Prevail Foundry Inc, Learning Masterminds, Inspiring Teachers, Rising Academies</li>" +
  "<li><strong>Funding Source</strong><br>Prevail Foundry Inc</li></ul>";

const P4 = "<p>The Ghana Foundational Learning Reform Phase 1 will support the Government of Ghana to finalise the relevant revised primary FLN curriculum, harmonise, produce and distribute B1 teacher and learner materials for English Language, Mathematics and 12 approved Ghanaian Languages, operationalise Ghanaian Language as the primary medium of teaching and learning, prepare teachers and education officials to use the materials and field test the materials across 36 schools during the 2026/2027 academic year. Evidence from field testing will be used to refine the materials and inform Phase 2 and future national implementation.</p>";
const P5 = "<p>The B1 Harmonisation Project is the Basic 1 component of the Ghana Foundational Learning Reform Programme, Phase 1, funded by the Prevail Foundry Inc. The project is led by the Ghana Education Service and delivered through a consortium of technical partners: Inspiring Teachers for English, Learning Masterminds for Ghanaian Languages, and Rising Academies for Mathematics. T-TEL coordinates the programme on behalf of the Government of Ghana.</p>";
const P6 = "<p>The project harmonises Basic 1 literacy and numeracy teaching and learning materials across English, Mathematics and the 12 official Ghanaian Languages, and field tests those materials across 36 schools in 12 districts spanning Ghana's three geographic belts. Scope is confined to Basic 1.</p>";
const P7 = "<p>The project aims to develop high quality, harmonised Teacher Guides and Learner Materials for Basic 1 across English, Mathematics and all 12 Ghanaian Languages, produced on a term by term basis. It aims to harmonise the training approach and delivery model used to prepare teachers, District Education Officers and other school level staff to use these materials, currently reaching approximately 158 participants across the southern, middle and northern belts. It also aims to field test the harmonised materials and training across the 36 selected schools, generating implementation evidence on materials quality, training effectiveness and classroom delivery that will inform later phases of the reform.</p>";
const P8 = "<p>Materials harmonisation and development is the central workstream, governed by the approved Materials Harmonisation Guide, which sets out the common lesson structure, design principles and subject specific nuances that the three technical partners' Teacher Guides and Learner Materials must follow. Monitoring and evaluation tracks implementation fidelity.</p>";

await connectDb();

const post = await Post.findOne({ slug: "ghana-foundational-learning-reform-phase-1" });
if (!post) throw new Error("post not found");

const alt = "Ghana Foundational Learning Reform Phase 1";
const featured = await uploadPhoto("image4.jpeg", alt);
const inline1 = await uploadPhoto("image1.jpeg", alt);
const inline2 = await uploadPhoto("image2.jpeg", alt);
const inline3 = await uploadPhoto("image3.jpeg", alt);

// The remaining 11 — uploaded to Media regardless, available to swap in later.
const rest = ["image5", "image6", "image7", "image8", "image9", "image10", "image11", "image12", "image13", "image14", "image15"];
for (const name of rest) await uploadPhoto(`${name}.jpeg`, alt);

const sections = [
  { type: "facts", html: P4 + P5, aside: ASIDE, image: null, flip: false },
  { type: "split", html: P6, aside: "", image: inline1._id, flip: false },
  { type: "split", html: P7, aside: "", image: inline2._id, flip: true },
  { type: "split", html: P8, aside: "", image: inline3._id, flip: false },
];

console.log("\n--- updating post ---");
if (!DRY) {
  post.excerpt = "Supporting the Government of Ghana to harmonise Basic 1 literacy and numeracy materials across English, Mathematics and 12 Ghanaian Languages, funded by the Prevail Foundry Inc.";
  post.body = P4 + P5 + P6 + P7 + P8;
  post.sections = sections;
  post.featuredImage = featured._id;
  await post.save();
  console.log("saved.");
} else {
  console.log("[dry] would update body/sections/featuredImage/excerpt");
}

await disconnectDb();

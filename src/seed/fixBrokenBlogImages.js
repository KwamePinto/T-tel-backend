/**
 * Fixes the 6 blog-post body images pointing at a dead legacy host
 * (t-tel-live.citservices.net, plus plain http on an https site — doubly
 * broken) by re-fetching the real image from t-tel.org and re-hosting it
 * through our own storage, same as every other migrated asset.
 *
 *   node src/seed/fixBrokenBlogImages.js [--dry]
 *
 * Two of the five affected posts ("A Seat at the Table With George
 * Wayo-Nartey…" and "Ghana's Classroom Revolution…") don't exist anywhere on
 * t-tel.org or in the local mirror — confirmed via the site's own search and
 * a direct fetch of every plausible URL — so there's no original image to
 * recover for them. Their broken <img> tags are removed instead of left
 * broken; a real photo would need to be supplied and added by hand.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import https from "node:https";
import { connectDb, disconnectDb } from "../config/db.js";
import { env } from "../config/env.js";
import { Post, Media } from "../models/index.js";

// A plain `storage().save()` here reliably gets a garbled non-XML response
// from R2 on this network specifically — traced to Node's default HTTPS
// agent reusing a keep-alive socket opened for MongoDB's own TLS connection.
// A dedicated client with a fresh, non-keep-alive agent sidesteps it; the
// {key, url} shape matches storage.js's own s3 driver exactly, so this stays
// a drop-in for what storage().save() would have returned.
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
    Bucket: env.s3.bucket,
    Key: key,
    Body: fs.readFileSync(localPath),
    ContentType: mimetype,
    CacheControl: "public, max-age=2592000",
  }));
  return { key, url: `/uploads/${key}` };
}

const DRY = process.argv.includes("--dry");
const MEDIA_BASE = "https://pub-c79e6670d04e48dbb55e63d5171ea153.r2.dev";

// Found by matching each broken image's alt text / position against the
// real article on t-tel.org (mirror where it existed, a live fetch where the
// mirror's crawl of that page was empty).
const FIXES = [
  {
    slug: "nacca-presents-ghanaian-sign-language-curriculum-at-africas-flex-2026-summit",
    sourceUrl: "https://t-tel.org/wp-content/uploads/2026/08/Picture-1.png",
    alt: "NaCCA presents Ghanaian Sign Language Curriculum",
  },
  {
    slug: "building-foundational-literacy-and-numeracy-in-busiya-da-basic-school",
    sourceUrl: "https://t-tel.org/wp-content/uploads/2023/10/Screenshot-2023-10-14-at-11.55.25-PM-1.png",
    alt: "Building foundational literacy and numeracy in Busiya D/A Basic School",
  },
  {
    slug: "the-impact-of-professional-learning-communities-plcs-in-bolgatanga-senior-high-school",
    sourceUrl: "https://t-tel.org/wp-content/uploads/2023/09/T-TEL20REPORT20spread_Page_23-1414x2048.png",
    alt: "The Impact of Professional Learning Communities (PLCs) in Bolgatanga Senior High School",
  },
];

// No original exists anywhere for these — the broken tag is just removed.
const REMOVE_ONLY = [
  "a-seat-at-the-table-with-george-wayo-nartey-former-student-of-christian-methodist-senior-high-school",
  "ghanas-classroom-revolution-how-subject-specific-apps-are-transforming-teaching",
];

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function downloadTo(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf;
}

await connectDb();

let fixed = 0;

for (const { slug, sourceUrl, alt } of FIXES) {
  const post = await Post.findOne({ slug });
  assert(post, `post not found: ${slug}`);

  const brokenTag = [...post.body.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes("citservices.net"));
  if (!brokenTag) {
    console.log(`\n${slug} — already fixed, skipping`);
    continue;
  }

  console.log(`\n${slug}`);
  console.log(`  fetching ${sourceUrl}`);

  const ext = path.extname(new URL(sourceUrl).pathname) || ".png";
  // Has to live under env.uploadDir — uploadToR2 derives the R2 key from the
  // path relative to it, same convention storage.js's own s3 driver uses.
  const stageDir = path.join(env.uploadDir, "blog-fixes");
  fs.mkdirSync(stageDir, { recursive: true });
  const tmp = path.join(stageDir, `fix-${crypto.randomBytes(6).toString("hex")}${ext}`);
  const buf = await downloadTo(sourceUrl, tmp);
  console.log(`  downloaded ${(buf.length / 1024).toFixed(0)} KB`);

  if (DRY) {
    fs.rmSync(tmp, { force: true });
    console.log("  [dry] would upload + replace tag");
    continue;
  }

  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  const size = buf.length;
  const saved = await uploadToR2(tmp, mime);
  fs.rmSync(tmp, { force: true });
  const media = await Media.create({
    filename: path.basename(saved.key),
    originalName: path.basename(sourceUrl),
    key: saved.key,
    url: saved.url,
    mime,
    size,
    alt,
  });

  const publicUrl = MEDIA_BASE + media.url.slice("/uploads".length);
  const newTag = `<img src="${publicUrl}" alt="${alt}">`;
  post.body = post.body.replace(brokenTag, newTag);
  await post.save();

  console.log(`  uploaded -> ${publicUrl}`);
  console.log(`  post body updated`);
  fixed += 1;
}

let cleaned = 0;
for (const slug of REMOVE_ONLY) {
  const post = await Post.findOne({ slug });
  assert(post, `post not found: ${slug}`);

  const brokenTags = [...post.body.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((t) => t.includes("citservices.net"));
  if (!brokenTags.length) {
    console.log(`\n${slug} — already clean, nothing to remove`);
    continue;
  }

  console.log(`\n${slug}`);
  console.log(`  no original image exists anywhere for this post — removing ${brokenTags.length} broken tag(s)`);

  if (DRY) {
    console.log("  [dry] would remove");
    continue;
  }

  let body = post.body;
  for (const tag of brokenTags) body = body.replace(tag, "");
  post.body = body;
  await post.save();
  cleaned += 1;
}

console.log(`\n${fixed} post(s) fixed with a real image, ${cleaned} post(s) had broken tags removed (no source image exists).`);
await disconnectDb();

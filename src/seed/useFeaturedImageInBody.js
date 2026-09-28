/**
 * "A Seat at the Table With George Wayo-Nartey…" gets its own featured image
 * inserted into the body, right after the opening paragraph, since no
 * original body image exists anywhere to recover (see fixBrokenBlogImages.js).
 * "Ghana's Classroom Revolution…" already has zero <img> tags in its body
 * (its two broken tags were removed in that same earlier pass) — this script
 * just confirms that and leaves it untouched.
 *
 *   node src/seed/useFeaturedImageInBody.js [--dry]
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Post, Media } from "../models/index.js";

const DRY = process.argv.includes("--dry");
const MEDIA_BASE = "https://pub-c79e6670d04e48dbb55e63d5171ea153.r2.dev";

const slug = "a-seat-at-the-table-with-george-wayo-nartey-former-student-of-christian-methodist-senior-high-school";
const confirmOnlySlug = "ghanas-classroom-revolution-how-subject-specific-apps-are-transforming-teaching";

await connectDb();

const post = await Post.findOne({ slug });
if (!post) throw new Error(`post not found: ${slug}`);
if (!post.featuredImage) throw new Error(`${slug} has no featuredImage`);

const media = await Media.findById(post.featuredImage);
if (!media) throw new Error(`featuredImage record missing for ${slug}`);

const existingImgs = post.body.match(/<img\b[^>]*>/g) || [];
if (existingImgs.length) {
  console.log(`${slug} already has ${existingImgs.length} image(s) in body — not touching it.`);
} else {
  const publicUrl = MEDIA_BASE + media.url.slice("/uploads".length);
  const tag = `<img src="${publicUrl}" alt="${post.title}">`;

  const firstParaEnd = post.body.indexOf("</p>");
  if (firstParaEnd === -1) throw new Error("no <p> found to insert after");
  const insertAt = firstParaEnd + "</p>".length;
  const newBody = post.body.slice(0, insertAt) + tag + post.body.slice(insertAt);

  console.log(`${slug}`);
  console.log(`  inserting featured image -> ${publicUrl}`);
  if (!DRY) {
    post.body = newBody;
    await post.save();
    console.log("  saved");
  } else {
    console.log("  [dry] not saved");
  }
}

const confirmPost = await Post.findOne({ slug: confirmOnlySlug });
const confirmImgs = confirmPost.body.match(/<img\b[^>]*>/g) || [];
console.log(`\n${confirmOnlySlug}`);
console.log(`  <img> tags in body: ${confirmImgs.length} (expected 0 — already removed in the earlier fix)`);

await disconnectDb();

/**
 * Moves the panel that used to be hard-coded on every Focus Area into each
 * post's own record.
 *
 * All nine areas were showing one identical partners paragraph, because the
 * text lived in the component. Seeding it gives every area the same starting
 * point it already had on screen, and from here each one can be written to
 * say something about that area in particular — which is the point of a panel
 * that stays beside the reader the whole way down.
 *
 * Never overwrites a panel that has already been edited.
 *
 *   node scripts/seedFocusKeyInfo.js
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Post } from "../models/Post.js";
import { ContentType } from "../models/ContentType.js";

const KEY_INFO = {
  label: "Institutional Links",
  title: "Delivery Partners",
  html:
    "<p>Delivered with the Ministry of Education, Ghana Education Service, GTEC, NaCCA, the National Teaching Council and NaSIA, alongside our funding and research partners.</p>",
  linkLabel: "All partners",
  linkUrl: "/about-us/our-partners",
};

async function main() {
  await connectDb();

  const type = await ContentType.findOne({ slug: "focus-areas" }).lean();
  if (!type) throw new Error("no focus-areas content type");

  const posts = await Post.find({ contentType: type._id, deletedAt: null });
  let seeded = 0;

  for (const post of posts) {
    if (post.keyInfo?.title) {
      console.log(`  kept    ${post.slug}`);
      continue;
    }
    post.keyInfo = { ...KEY_INFO };
    await post.save();
    console.log(`  seeded  ${post.slug}`);
    seeded++;
  }

  console.log(`\ndone — ${seeded} seeded, ${posts.length - seeded} already set`);
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});

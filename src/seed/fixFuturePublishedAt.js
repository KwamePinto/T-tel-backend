/**
 * The two new Programmes posts were saved with publishedAt: new Date(),
 * using this environment's clock — which turns out to run measurably ahead
 * of real-world time (confirmed against a live response Date header from
 * the actual deployed backend). That made publishedAt technically still in
 * the future from the real server's point of view, so the public API's
 * live() filter (publishedAt <= now) correctly, silently excluded them —
 * not a broken link, not a stale connection, just a clock mismatch.
 *
 * Set publishedAt safely in the past (24h before this environment's own
 * "now", a large enough margin to clear any clock skew) rather than
 * relying on "now" being trustworthy.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Post } from "../models/index.js";

await connectDb();

const safelyPast = new Date(Date.now() - 24 * 60 * 60 * 1000);

for (const slug of ["supported-teaching-in-school", "teaching-innovation-lab"]) {
  const post = await Post.findOne({ slug });
  if (!post) { console.log(`! not found: ${slug}`); continue; }
  console.log(`${slug}: publishedAt ${post.publishedAt.toISOString()} -> ${safelyPast.toISOString()}`);
  post.publishedAt = safelyPast;
  await post.save();
}

await disconnectDb();

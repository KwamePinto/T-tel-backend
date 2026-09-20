/**
 * Rebuilds the Programmes branch of the main menu from the live posts.
 *
 *   node src/seed/rebuildProgrammesNav.js
 *
 * seedNavChildren() only adds items by URL and never touches an existing
 * one, so a programme added after the nav was first seeded (Gates
 * Foundation) never appeared, and a retitled one (EdTech Hub, formerly
 * labelled "COVID-19 Impact Assessment Study") kept its old label. This
 * replaces the branch outright from the current Programmes posts.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Menu, MenuItem, Post, ContentType } from "../models/index.js";

await connectDb();

const menu = await Menu.findOne({ slug: "main" });
if (!menu) {
  console.error("main menu not found");
  await disconnectDb();
  process.exit(1);
}

const parent = await MenuItem.findOne({ menu: menu._id, label: "Programmes", parent: null });
if (!parent) {
  console.error("Programmes item not found in the main menu");
  await disconnectDb();
  process.exit(1);
}

const removed = await MenuItem.deleteMany({ menu: menu._id, parent: parent._id });

const type = await ContentType.findOne({ slug: "programmes" });
const posts = type
  ? await Post.find({ contentType: type._id, status: "published", deletedAt: null })
      .sort("sortOrder title")
      .select("title slug")
      .lean()
  : [];

let order = 0;
for (const post of posts) {
  await MenuItem.create({
    menu: menu._id, parent: parent._id, label: post.title, url: `/programmes/${post.slug}`, sortOrder: order++,
  });
}

console.log(`removed ${removed.deletedCount} item(s); created ${posts.length}`);
for (const post of posts) console.log(`   ${post.title} -> /programmes/${post.slug}`);

await disconnectDb();

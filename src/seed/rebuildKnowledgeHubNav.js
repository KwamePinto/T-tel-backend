/**
 * Rebuilds the Knowledge Hub branch of the main menu from the collection tree.
 *
 *   node src/seed/rebuildKnowledgeHubNav.js
 *
 * The first pass seeded these as "/knowledge-hub?collection=<slug>" against the
 * old flat collection list. The collection pages are real routes now
 * ("/knowledge-hub/<slug>"), so every one of those links dropped the visitor on
 * the generic index instead. This replaces the branch outright:
 *
 *   Knowledge Hub
 *     Teacher Education            -> and its four sub-collections beneath it
 *     Basic Education
 *     Secondary Education
 *     T-TEL Reports & Publications
 *
 * Policies is deliberately left out — it feeds the Our Policies page, not the
 * Knowledge Hub browse.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Menu, MenuItem, DocumentCategory } from "../models/index.js";

const EXCLUDE = new Set(["policies"]);

await connectDb();

const menu = await Menu.findOne({ slug: "main" });
if (!menu) {
  console.error("main menu not found");
  await disconnectDb();
  process.exit(1);
}

const parent = await MenuItem.findOne({ menu: menu._id, label: "Knowledge Hub", parent: null });
if (!parent) {
  console.error("Knowledge Hub item not found in the main menu");
  await disconnectDb();
  process.exit(1);
}

// clear the existing branch, children and grandchildren alike
const oldChildren = await MenuItem.find({ menu: menu._id, parent: parent._id }).select("_id").lean();
const oldIds = oldChildren.map((c) => c._id);
const removedGrandchildren = await MenuItem.deleteMany({ menu: menu._id, parent: { $in: oldIds } });
const removedChildren = await MenuItem.deleteMany({ _id: { $in: oldIds } });

const cats = await DocumentCategory.find().sort("sortOrder name").lean();
const tops = cats.filter((c) => !c.parent && !EXCLUDE.has(c.slug));

let created = 0;
let order = 0;

for (const top of tops) {
  const item = await MenuItem.create({
    menu: menu._id,
    parent: parent._id,
    label: top.name,
    url: `/knowledge-hub/${top.slug}`,
    sortOrder: order++,
  });
  created++;

  const children = cats.filter((c) => String(c.parent) === String(top._id));
  let childOrder = 0;
  for (const child of children) {
    await MenuItem.create({
      menu: menu._id,
      parent: item._id,
      label: child.name,
      url: `/knowledge-hub/${child.slug}`,
      sortOrder: childOrder++,
    });
    created++;
  }
}

console.log(
  `  removed ${removedChildren.deletedCount} child + ` +
  `${removedGrandchildren.deletedCount} grandchild item(s); created ${created}`,
);

for (const top of tops) {
  const kids = cats.filter((c) => String(c.parent) === String(top._id));
  console.log(`    ${top.name} -> /knowledge-hub/${top.slug}${kids.length ? ` (${kids.length} beneath)` : ""}`);
}

await disconnectDb();

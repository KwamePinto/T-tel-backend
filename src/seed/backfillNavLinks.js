/**
 * Links every existing menu item that was hand-created before nav placement
 * existed (linkType "url") back to the Post or Page it actually points at,
 * and fills in that record's own navPlacement/showInNav so the admin screen
 * shows the truth instead of a blank field.
 *
 * Without this, only content created or edited *after* the nav-placement
 * feature shipped is actually linked — everything older has a menu row that
 * looks right but has no relationship to its Post/Page, so trashing that
 * content never cascades to the menu, and its own editor shows "Not shown in
 * navigation" even though it plainly is.
 *
 *   node src/seed/backfillNavLinks.js [--dry]
 *
 * Only touches an item when its url matches exactly one Post or Page —
 * anything ambiguous or unmatched is left untouched and reported, never
 * guessed at.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Post, Page, ContentType, Menu, MenuItem } from "../models/index.js";
import { getMainMenuId } from "../services/navPlacement.js";

const DRY = process.argv.includes("--dry");

// Reverse of services/navPlacement.js's POST_URL_PREFIX.
const PREFIX_TO_CONTENT_TYPE = { "news-and-media": "blog", "focus-areas": "focus-areas", programmes: "programmes" };
// Mirrors services/navPlacement.js's PAGE_SECTION_URL — used here only to
// sanity-check a page's section against where it actually sits before
// touching it, not to derive anything.
const PAGE_SECTION_URL = { "about-us": "/about-us", "focus-areas": "/focus-areas", programmes: "/programmes" };

await connectDb();

const menuId = await getMainMenuId();
if (!menuId) throw new Error("No main menu found — nothing to back-fill.");

const items = await MenuItem.find({ menu: menuId, linkType: "url", deletedAt: null }).lean();
const contentTypes = await ContentType.find().lean();
const ctBySlug = new Map(contentTypes.map((c) => [c.slug, c]));

let linked = 0;
let skipped = 0;

for (const item of items) {
  const url = (item.url || "").replace(/^\/+|\/+$/g, "");
  const [prefix, ...rest] = url.split("/");
  const slug = rest.join("/");

  let match = null; // { kind: "post" | "page", doc }

  const ctSlug = PREFIX_TO_CONTENT_TYPE[prefix];
  if (ctSlug && slug) {
    const contentType = ctBySlug.get(ctSlug);
    const post = contentType && await Post.findOne({ contentType: contentType._id, slug, deletedAt: null });
    if (post) match = { kind: "post", doc: post };
  }

  if (!match) {
    const page = await Page.findOne({ slug: url, deletedAt: null });
    if (page) match = { kind: "page", doc: page };
  }

  if (!match) {
    skipped += 1;
    console.log(`  ! no match — "${item.label}" (${item.url}) left as a plain link`);
    continue;
  }

  // Guard against a post/page that somehow already has a different linked
  // item (would silently create a duplicate link otherwise).
  const already = await MenuItem.findOne({ linkType: match.kind, linkRef: match.doc._id, _id: { $ne: item._id } });
  if (already) {
    skipped += 1;
    console.log(`  ! "${item.label}" (${item.url}) already linked elsewhere — skipped`);
    continue;
  }

  // The item's real current parent, not an assumption that it sits directly
  // under a top-level tab matching its own url prefix.
  let parentUrl = `/${prefix}`;
  if (item.parent) {
    const parentItem = await MenuItem.findById(item.parent).lean();
    if (parentItem?.url) parentUrl = parentItem.url;
  }

  if (match.kind === "page") {
    // syncPageNavPlacement derives a page's parent from its own `section`
    // field, not from wherever this item happens to sit today — if those
    // disagree, turning showInNav on now would silently re-parent it the
    // next time anyone saves the page. Flag it instead of guessing.
    const expectedUrl = PAGE_SECTION_URL[match.doc.section] || null;
    if (expectedUrl !== null && expectedUrl !== parentUrl) {
      skipped += 1;
      console.log(`  ! "${item.label}" (${item.url}) — page's section ("${match.doc.section}") implies parent ${expectedUrl}, but it actually sits under ${parentUrl}; left for manual review`);
      continue;
    }
  }

  linked += 1;
  console.log(`${DRY ? "[dry] " : ""}link "${item.label}" (${item.url}) -> ${match.kind} "${match.doc.title}"`);

  if (DRY) continue;

  await MenuItem.updateOne({ _id: item._id }, { linkType: match.kind, linkRef: match.doc._id });

  if (match.kind === "post") {
    const label = item.label === match.doc.title ? "" : item.label;
    await Post.updateOne({ _id: match.doc._id }, { navPlacement: { parentUrl, label } });
  } else {
    await Page.updateOne({ _id: match.doc._id }, { showInNav: true });
  }
}

console.log(`\n${linked} item(s) linked, ${skipped} left untouched.`);
await disconnectDb();

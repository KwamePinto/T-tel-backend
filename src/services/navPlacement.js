/**
 * Keeps a Post/Page's own nav placement field and its MenuItem in sync, so
 * choosing where something sits in the nav is one step in its own editor
 * instead of a separate trip to Menus. Trashing/restoring/destroying the
 * Post or Page cascades to the same MenuItem — see cascadeMenuItem below.
 */
import { Menu, MenuItem, Setting } from "../models/index.js";

const POST_URL_PREFIX = { blog: "news-and-media", "focus-areas": "focus-areas", programmes: "programmes" };
const PAGE_SECTION_URL = { "about-us": "/about-us", "focus-areas": "/focus-areas", programmes: "/programmes" };

export async function getMainMenuId() {
  const setting = await Setting.findOne({ key: "main_menu" }).lean();
  const menu = await Menu.findOne({ slug: setting?.value || "main" }).lean();
  return menu?._id || null;
}

export async function removeNavMenuItem(linkType, docId) {
  await MenuItem.deleteOne({ linkType, linkRef: docId });
}

export async function upsertNavMenuItem({ linkType, doc, active, parentId, label, url }) {
  if (!active) return removeNavMenuItem(linkType, doc._id);
  const menuId = await getMainMenuId();
  if (!menuId) return removeNavMenuItem(linkType, doc._id);

  const existing = await MenuItem.findOne({ linkType, linkRef: doc._id });
  const nextSortOrder = async () =>
    MenuItem.countDocuments({ menu: menuId, parent: parentId || null, deletedAt: null });

  if (existing) {
    const parentChanged = String(existing.parent || "") !== String(parentId || "");
    existing.parent = parentId || null;
    existing.label = label;
    existing.url = url;
    existing.deletedAt = null;
    if (parentChanged) existing.sortOrder = await nextSortOrder();
    await existing.save();
    return;
  }

  await MenuItem.create({
    menu: menuId, parent: parentId || null, label, url,
    linkType, linkRef: doc._id, sortOrder: await nextSortOrder(),
  });
}

export async function syncPostNavPlacement(doc) {
  const parentUrl = doc.navPlacement?.parentUrl || "";
  if (!parentUrl) return removeNavMenuItem("post", doc._id);

  await doc.populate("contentType");
  const prefix = POST_URL_PREFIX[doc.contentType?.slug];
  if (!prefix) return removeNavMenuItem("post", doc._id);

  const menuId = await getMainMenuId();
  const parent = await MenuItem.findOne({ menu: menuId, parent: null, url: parentUrl }).lean();

  await upsertNavMenuItem({
    linkType: "post", doc, active: true, parentId: parent?._id || null,
    label: doc.navPlacement.label || doc.title,
    url: `/${prefix}/${doc.slug}`,
  });
}

export async function syncPageNavPlacement(doc) {
  if (!doc.showInNav) return removeNavMenuItem("page", doc._id);

  let parentId = null;
  const parentUrl = PAGE_SECTION_URL[doc.section];
  if (parentUrl) {
    const menuId = await getMainMenuId();
    const parent = await MenuItem.findOne({ menu: menuId, parent: null, url: parentUrl }).lean();
    parentId = parent?._id || null;
  }

  await upsertNavMenuItem({
    linkType: "page", doc, active: true, parentId,
    label: doc.title,
    url: `/${doc.slug}`,
  });
}

export async function cascadeMenuItem(linkType, doc, patch) {
  await MenuItem.updateMany({ linkType, linkRef: doc._id }, patch);
}

export async function cascadeDestroyMenuItem(linkType, doc) {
  await MenuItem.deleteMany({ linkType, linkRef: doc._id });
}

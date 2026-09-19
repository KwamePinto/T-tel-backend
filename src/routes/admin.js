import { Router } from "express";
import {
  Post, Page, Person, PersonGroup, Partner, ContentType, Tag,
  Menu, MenuItem, Form, FormSubmission, Event, EventCategory,
  Slider, Document, DocumentCategory, User,
} from "../models/index.js";
import { crudFactory } from "../controllers/crudFactory.js";
import * as auth from "../controllers/authController.js";
import * as media from "../controllers/mediaController.js";
import * as settings from "../controllers/settingsController.js";
import * as trash from "../controllers/trashController.js";
import * as dashboard from "../controllers/dashboardController.js";
import { authenticate, requireAdmin, requireRole } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { toSlug } from "../utils/slug.js";

const router = Router();

/* ---------------- auth (public) ---------------- */
router.post("/auth/login", auth.login);
router.post("/auth/register", auth.register);
router.post("/auth/logout", auth.logout);

/* everything below requires a signed-in user */
router.use(authenticate);

router.get("/auth/me", auth.me);
router.patch("/auth/profile", auth.updateProfile);
router.get("/dashboard", dashboard.overview);

/** Mounts list/read/create/update/trash/restore/destroy/reorder for a model. */
function resource(path, Model, opts = {}, guard = requireRole("editor", "author")) {
  const c = crudFactory(Model, opts);
  const r = Router();
  r.get("/", c.list);
  r.post("/", guard, c.create);
  r.post("/reorder", guard, c.reorder);
  r.get("/:id", c.read);
  r.patch("/:id", guard, c.update);
  r.post("/:id/restore", guard, c.restore);
  r.delete("/:id", guard, c.trash);
  r.delete("/:id/permanent", requireAdmin, c.destroy);
  router.use(path, r);
  return r;
}

/* ---------------- content ---------------- */
/** The editor sends tags as free text ("policy, gender"); turn those into Tag
 *  documents so authors never have to manage a tag list by hand. */
async function resolveTagNames(payload) {
  if (!Array.isArray(payload.tagNames)) return payload;
  const names = [...new Set(payload.tagNames.map((n) => String(n).trim()).filter(Boolean))];
  delete payload.tagNames;
  payload.tags = await Promise.all(
    names.map(async (name) => {
      const slug = toSlug(name);
      const tag = await Tag.findOneAndUpdate(
        { slug },
        { $setOnInsert: { name, slug } },
        { new: true, upsert: true },
      );
      return tag._id;
    }),
  );
  return payload;
}

resource("/posts", Post, {
  searchable: ["title", "excerpt"],
  slugFrom: "title",
  populate: ["author", "contentType", "featuredImage", "tags", "sections.image"],
  defaultSort: "-publishedAt -createdAt",
  allowedFilters: ["status", "contentType", "tag"],
  filterMap: { tag: "tags" },
  transform: resolveTagNames,
});

resource("/pages", Page, {
  searchable: ["title", "slug"],
  slugFrom: "title",
  populate: ["heroImage"],
  defaultSort: "sortOrder -createdAt",
});

resource("/content-types", ContentType, {
  searchable: ["name", "slug"],
  slugFrom: "name",
  softDelete: false,
  defaultSort: "name",
}, requireAdmin);

resource("/tags", Tag, { searchable: ["name"], slugFrom: "name", softDelete: false, defaultSort: "name" });

resource("/people", Person, {
  searchable: ["name", "position"],
  slugFrom: "name",
  populate: ["photo", "group"],
  defaultSort: "sortOrder name",
});

resource("/person-groups", PersonGroup, {
  searchable: ["name"], slugFrom: "name", softDelete: false, defaultSort: "sortOrder name",
});

resource("/partners", Partner, {
  searchable: ["name"], slugFrom: "name", populate: ["logo"], defaultSort: "sortOrder name",
});

resource("/events", Event, {
  searchable: ["title", "location"], slugFrom: "title",
  populate: ["category", "coverImage", "form"], defaultSort: "-startAt",
});

resource("/event-categories", EventCategory, {
  searchable: ["name"], slugFrom: "name", softDelete: false, defaultSort: "name",
});

resource("/sliders", Slider, { searchable: ["name"], slugFrom: "name", populate: ["slides.image", "slides.video"] });

resource("/documents", Document, {
  searchable: ["title", "description"], slugFrom: "title",
  populate: ["file", "thumbnail", "category"], defaultSort: "sortOrder -createdAt",
});

resource("/document-collections", DocumentCategory, {
  searchable: ["name"], slugFrom: "name", softDelete: false, defaultSort: "sortOrder name",
});

/* ---------------- media ---------------- */
router.get("/media", media.listMedia);
router.post("/media", upload.array("files", 20), media.uploadMedia);
router.patch("/media/:id", media.updateMedia);
router.delete("/media/:id", requireRole("editor"), media.deleteMedia);
router.get("/media-folders", media.listFolders);
router.post("/media-folders", media.createFolder);
router.delete("/media-folders/:id", requireRole("editor"), media.deleteFolder);

/* ---------------- menus ---------------- */
resource("/menus", Menu, { searchable: ["name"], slugFrom: "name", softDelete: false, defaultSort: "name" }, requireRole("editor"));

router.get("/menus/:id/items", asyncHandler(async (req, res) => {
  const items = await MenuItem.find({ menu: req.params.id }).sort("sortOrder").lean();
  res.json({ items });
}));

// Replaces a menu's items wholesale — simplest correct way to persist a
// drag-and-drop tree, since parents and order change together.
router.put("/menus/:id/items", requireRole("editor"), asyncHandler(async (req, res) => {
  const { items = [] } = req.body;
  if (!Array.isArray(items)) throw ApiError.badRequest("items[] is required");

  await MenuItem.deleteMany({ menu: req.params.id });

  const idMap = new Map();
  const created = [];
  // insert breadth-first so a parent always exists before its children
  const queue = items.map((i) => ({ ...i, parentKey: i.parentKey ?? null }));
  let guard = 0;
  while (queue.length && guard++ < 10000) {
    const item = queue.shift();
    if (item.parentKey && !idMap.has(item.parentKey)) { queue.push(item); continue; }
    const doc = await MenuItem.create({
      menu: req.params.id,
      parent: item.parentKey ? idMap.get(item.parentKey) : null,
      label: item.label,
      url: item.url || "",
      linkType: item.linkType || "url",
      linkRef: item.linkRef || null,
      target: item.target || "_self",
      sortOrder: item.sortOrder ?? 0,
    });
    if (item.key) idMap.set(item.key, doc._id);
    created.push(doc);
  }
  res.json({ ok: true, items: created });
}));

/* ---------------- forms ---------------- */
resource("/forms", Form, { searchable: ["title"], slugFrom: "title", defaultSort: "-createdAt" }, requireRole("editor"));

router.get("/forms/:id/submissions", asyncHandler(async (req, res) => {
  const { page = 1, limit = 25 } = req.query;
  const filter = { form: req.params.id, deletedAt: null };
  const perPage = Math.min(Number(limit), 100);
  const [items, total, unread] = await Promise.all([
    FormSubmission.find(filter).sort("-createdAt").skip((page - 1) * perPage).limit(perPage).lean(),
    FormSubmission.countDocuments(filter),
    FormSubmission.countDocuments({ ...filter, isRead: false }),
  ]);
  res.json({ items, total, unread, page: Number(page), pages: Math.ceil(total / perPage) || 1 });
}));

router.patch("/submissions/:id", asyncHandler(async (req, res) => {
  const doc = await FormSubmission.findByIdAndUpdate(
    req.params.id, { $set: { isRead: req.body.isRead !== false } }, { new: true },
  );
  if (!doc) throw ApiError.notFound("Submission not found");
  res.json(doc);
}));

router.delete("/submissions/:id", requireRole("editor"), asyncHandler(async (req, res) => {
  await FormSubmission.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

/* ---------------- users ---------------- */
router.get("/users", requireAdmin, asyncHandler(async (req, res) => {
  const users = await User.find().sort("-createdAt").lean();
  const withCounts = await Promise.all(users.map(async (u) => ({
    ...u,
    contentCount: await Post.countDocuments({ author: u._id, deletedAt: null }),
  })));
  res.json({ items: withCounts, total: withCounts.length });
}));

router.post("/users", requireAdmin, asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) throw ApiError.badRequest("Name, email and password are required");
  if (await User.exists({ email: String(email).toLowerCase() })) {
    throw ApiError.conflict("An account with that email already exists");
  }
  const user = await User.create({ name, email, password, role: role || "author" });
  res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role });
}));

router.patch("/users/:id", requireAdmin, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("+password");
  if (!user) throw ApiError.notFound("User not found");
  const { name, email, role, password } = req.body;
  if (name) user.name = name;
  if (email) user.email = String(email).toLowerCase().trim();
  if (role) {
    // never let the last admin demote themselves and lock everyone out
    if (user.role === "admin" && role !== "admin" && (await User.countDocuments({ role: "admin" })) <= 1) {
      throw ApiError.badRequest("This is the only admin account — promote another admin first");
    }
    user.role = role;
  }
  if (password) user.password = password;
  await user.save();
  res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
}));

// Deleting an author must say what happens to their content.
router.delete("/users/:id", requireAdmin, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound("User not found");
  if (String(user._id) === String(req.user._id)) throw ApiError.badRequest("You cannot delete your own account");
  if (user.role === "admin" && (await User.countDocuments({ role: "admin" })) <= 1) {
    throw ApiError.badRequest("This is the only admin account");
  }

  const { reassignTo } = req.query; // user id, or omit to leave content unattributed
  if (reassignTo) await Post.updateMany({ author: user._id }, { $set: { author: reassignTo } });
  else await Post.updateMany({ author: user._id }, { $set: { author: null } });

  await user.deleteOne();
  res.json({ ok: true, reassigned: Boolean(reassignTo) });
}));

/* ---------------- trash ---------------- */
router.get("/trash", trash.listTrash);
router.post("/trash/restore-all", requireRole("editor"), trash.restoreAll);
router.delete("/trash/empty", requireAdmin, trash.emptyTrash);
router.post("/trash/:type/:id/restore", requireRole("editor"), trash.restoreItem);
router.delete("/trash/:type/:id", requireAdmin, trash.destroyItem);

/* ---------------- settings ---------------- */
router.get("/settings/:group/schema", settings.getSettingsSchema);
router.get("/settings/:group", settings.getSettings);
router.put("/settings/:group", requireRole("editor"), settings.saveSettings);

export default router;

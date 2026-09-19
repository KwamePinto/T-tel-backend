import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { storage } from "../services/storage.js";
import { escapeRegex } from "../utils/escapeRegex.js";
import rateLimit from "express-rate-limit";
import {
  Post, Page, Person, PersonGroup, Partner, ContentType,
  Menu, MenuItem, Form, FormSubmission, Event, Slider,
  Document, DocumentCategory, Setting,
} from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";

const router = Router();

const published = { deletedAt: null, status: "published" };
const live = () => ({ ...published, $or: [{ publishedAt: { $lte: new Date() } }, { publishedAt: null }] });

/* ---------------- site bootstrap ----------------
   One request that returns everything the shell needs: settings, menus and
   navigation. Saves the front end from a waterfall of calls on first paint. */
router.get("/bootstrap", asyncHandler(async (req, res) => {
  const [settings, menus] = await Promise.all([
    Setting.asObject("theme"),
    Menu.find().lean(),
  ]);

  const items = await MenuItem.find({ menu: { $in: menus.map((m) => m._id) } })
    .sort("sortOrder").lean();

  // nest items under their parents so the client renders the tree directly
  const build = (menuId, parent = null) =>
    items
      .filter((i) => String(i.menu) === String(menuId) && String(i.parent ?? null) === String(parent ?? null))
      .map((i) => ({
        id: i._id, label: i.label, url: i.url, target: i.target,
        children: build(menuId, i._id),
      }));

  res.json({
    settings,
    menus: Object.fromEntries(
      menus.map((m) => [m.slug, { name: m.name, location: m.location, items: build(m._id) }]),
    ),
  });
}));

/* ---------------- posts ---------------- */
router.get("/posts", asyncHandler(async (req, res) => {
  const { type, tag, search, page = 1, limit = 9, sort } = req.query;

  // Curated types (focus areas, programmes) read in the order an editor set;
  // editorial types read newest first.
  const CURATED = new Set(["focus-areas", "programmes"]);
  const order = sort === "order" || (!sort && CURATED.has(type)) ? "sortOrder" : "-publishedAt -createdAt";

  const filter = live();
  if (type) {
    const ct = await ContentType.findOne({ slug: type }).lean();
    if (!ct) throw ApiError.notFound(`Unknown content type "${type}"`);
    filter.contentType = ct._id;
  }
  if (tag) filter.tags = tag;
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$and = [{ $or: [{ title: rx }, { excerpt: rx }] }];
  }

  const perPage = Math.min(Number(limit) || 9, 50);
  const [items, total] = await Promise.all([
    Post.find(filter).sort(order)
      .skip((page - 1) * perPage).limit(perPage)
      .populate("featuredImage", "url alt width height")
      .populate("contentType", "name slug")
      .populate("author", "name")
      .populate("tags", "name slug")
      .lean(),
    Post.countDocuments(filter),
  ]);

  res.json({ items, total, page: Number(page), pages: Math.ceil(total / perPage) || 1 });
}));

router.get("/posts/:slug", asyncHandler(async (req, res) => {
  const post = await Post.findOne({ slug: req.params.slug, ...live() })
    .populate("featuredImage", "url alt width height")
    .populate("contentType", "name slug")
    .populate("author", "name")
    .populate("tags", "name slug")
    .lean();
  if (!post) throw ApiError.notFound("Post not found");
  res.json(post);
}));

/* ---------------- pages ----------------
   Wildcard, not :slug — page slugs are nested paths like
   "about-us/our-history", which a single-segment param cannot match. */
router.get("/pages/*", asyncHandler(async (req, res) => {
  const slug = String(req.params[0] || "").replace(/^\/+|\/+$/g, "");
  const page = await Page.findOne({ slug, ...live() })
    .populate("heroImage", "url alt width height")
    .lean();
  if (!page) throw ApiError.notFound("Page not found");
  res.json(page);
}));

/* ---------------- people ---------------- */
router.get("/people", asyncHandler(async (req, res) => {
  const filter = { deletedAt: null, status: "published" };
  if (req.query.group) {
    const g = await PersonGroup.findOne({ slug: req.query.group }).lean();
    if (!g) throw ApiError.notFound("Unknown group");
    filter.group = g._id;
  }
  const items = await Person.find(filter).sort("sortOrder name")
    .populate("photo", "url alt width height").populate("group", "name slug").lean();
  res.json({ items, total: items.length });
}));

router.get("/person-groups", asyncHandler(async (req, res) => {
  const groups = await PersonGroup.find().sort("sortOrder name").lean();
  const withCounts = await Promise.all(groups.map(async (g) => ({
    ...g, count: await Person.countDocuments({ group: g._id, deletedAt: null, status: "published" }),
  })));
  res.json({ items: withCounts });
}));

/* ---------------- partners ---------------- */
router.get("/partners", asyncHandler(async (req, res) => {
  const filter = { deletedAt: null };
  if (req.query.group) filter.group = req.query.group;
  if (req.query.home === "true") filter.showOnHome = true;
  const items = await Partner.find(filter).sort("sortOrder name").populate("logo", "url alt").lean();
  res.json({ items });
}));

/* ---------------- knowledge hub ---------------- */
router.get("/documents", asyncHandler(async (req, res) => {
  const { collection, search, year, page = 1, limit = 24, sort = "date", order = "desc" } = req.query;
  const filter = { deletedAt: null, status: "published" };

  // mirrors the controls the old Knowledge Hub offered
  const SORTS = { date: "createdAt", title: "title", updated: "updatedAt", downloads: "downloads" };
  const dir = order === "asc" ? "" : "-";
  const sortBy = `${dir}${SORTS[sort] || SORTS.date}`;

  if (collection) {
    const c = await DocumentCategory.findOne({ slug: collection }).lean();
    if (!c) throw ApiError.notFound("Unknown collection");
    // asking for a parent (e.g. Teacher Education) returns everything filed
    // under it as well as anything sitting directly on the parent
    const children = await DocumentCategory.find({ parent: c._id }).select("_id").lean();
    filter.category = children.length
      ? { $in: [c._id, ...children.map((x) => x._id)] }
      : c._id;
  }
  if (year) filter.year = Number(year);
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ title: rx }, { description: rx }, { tags: rx }];
  }

  const perPage = Math.min(Number(limit) || 24, 100);
  const [items, total] = await Promise.all([
    Document.find(filter).sort(sortBy)
      .skip((page - 1) * perPage).limit(perPage)
      .populate("file", "url originalName size mime")
      .populate("thumbnail", "url alt")
      .populate("category", "name slug").lean(),
    Document.countDocuments(filter),
  ]);
  res.json({ items, total, page: Number(page), pages: Math.ceil(total / perPage) || 1 });
}));

router.get("/document-collections", asyncHandler(async (req, res) => {
  const cols = await DocumentCategory.find().sort("sortOrder name").lean();

  // one grouped count instead of a query per collection
  const counts = new Map(
    (await Document.aggregate([
      { $match: { deletedAt: null, status: "published" } },
      { $group: { _id: "$category", n: { $sum: 1 } } },
    ])).map((r) => [String(r._id), r.n]),
  );

  const own = (c) => counts.get(String(c._id)) || 0;
  const tops = cols.filter((c) => !c.parent);

  const items = tops.map((top) => {
    const children = cols
      .filter((c) => String(c.parent) === String(top._id))
      .map((c) => ({ ...c, count: own(c) }));
    return {
      ...top,
      children,
      // a parent shows everything filed beneath it
      count: own(top) + children.reduce((n, c) => n + c.count, 0),
    };
  });

  res.json({ items });
}));

// Counts a download, then hands back the URL to fetch.
router.post("/documents/:id/download", asyncHandler(async (req, res) => {
  const doc = await Document.findByIdAndUpdate(req.params.id, { $inc: { downloads: 1 } }, { new: true })
    .populate("file", "url originalName").lean();
  if (!doc) throw ApiError.notFound("Document not found");
  // point at the streaming route so the file saves under its real name rather
  // than the hashed one it is stored as
  res.json({ url: `/api/documents/${doc._id}/file`, filename: doc.file?.originalName });
}));

/**
 * Serves the PDF under its original filename, from wherever it is stored.
 * `?inline=1` asks the browser to display it rather than save it, which is
 * what the on-page reader loads.
 */
router.get("/documents/:id/file", asyncHandler(async (req, res) => {
  const doc = await Document.findOne({ _id: req.params.id, deletedAt: null, status: "published" })
    .populate("file", "key originalName mime").lean();
  if (!doc?.file) throw ApiError.notFound("Document not found");

  const filename = doc.file.originalName || path.basename(doc.file.key);
  const inline = req.query.inline === "1" || req.query.inline === "true";

  if (inline) {
    // Helmet sends X-Frame-Options: SAMEORIGIN for everything, which stops the
    // site framing a document served from this origin — the reader just shows
    // the browser's broken-file icon. Swap it for frame-ancestors naming the
    // front end, which is the modern equivalent and can allow one other origin.
    res.removeHeader("X-Frame-Options");
    const ancestors = env.clientOrigin
      .split(",")
      .map((o) => o.trim().replace(/\/+$/, ""))
      .filter(Boolean);
    res.setHeader("Content-Security-Policy", `frame-ancestors 'self' ${ancestors.join(" ")}`.trim());
  }

  // On remote storage, hand back a short-lived signed URL: the download goes
  // straight from the bucket to the visitor, carrying the right filename,
  // without a few hundred megabytes passing through this process.
  const signed = await storage().downloadUrl(doc.file.key, filename, { inline });
  if (signed) return res.redirect(302, signed);

  const abs = path.join(env.uploadDir, doc.file.key);
  if (!fs.existsSync(abs)) throw ApiError.notFound("File is missing from storage");

  res.setHeader("Cache-Control", "public, max-age=2592000");
  res.type(doc.file.mime || "application/pdf");

  if (inline) {
    // sendFile handles range requests, which is what lets a browser's PDF
    // viewer paint page one of a 150MB manual without fetching the rest
    res.setHeader("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`);
    return res.sendFile(abs);
  }
  // sendFile sets Content-Disposition from this name and handles range requests
  res.download(abs, filename);
}));

/* ---------------- events ---------------- */
router.get("/events", asyncHandler(async (req, res) => {
  const { upcoming, limit = 12 } = req.query;
  const filter = { deletedAt: null, status: "published" };
  if (upcoming === "true") filter.startAt = { $gte: new Date() };
  const items = await Event.find(filter).sort(upcoming === "true" ? "startAt" : "-startAt")
    .limit(Math.min(Number(limit), 50))
    .populate("coverImage", "url alt").populate("category", "name slug").lean();
  res.json({ items });
}));

router.get("/events/:slug", asyncHandler(async (req, res) => {
  const ev = await Event.findOne({ slug: req.params.slug, deletedAt: null, status: "published" })
    .populate("coverImage", "url alt").populate("category", "name slug").populate("form").lean();
  if (!ev) throw ApiError.notFound("Event not found");
  res.json(ev);
}));

/* ---------------- sliders ---------------- */
router.get("/sliders/:slug", asyncHandler(async (req, res) => {
  const slider = await Slider.findOne({ slug: req.params.slug, deletedAt: null })
    .populate("slides.image", "url alt width height")
    .populate("slides.video", "url mime").lean();
  if (!slider) throw ApiError.notFound("Slider not found");
  res.json(slider);
}));

/* ---------------- forms ---------------- */
router.get("/forms/:slug", asyncHandler(async (req, res) => {
  const form = await Form.findOne({ slug: req.params.slug, status: "active", deletedAt: null })
    .select("-settings.notifyEmails").lean();
  if (!form) throw ApiError.notFound("Form not found");
  res.json(form);
}));

const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  message: { error: "Too many submissions — please try again shortly." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/forms/:slug/submit", submitLimiter, asyncHandler(async (req, res) => {
  const form = await Form.findOne({ slug: req.params.slug, status: "active", deletedAt: null });
  if (!form) throw ApiError.notFound("Form not found");

  const payload = { ...req.body };

  // honeypot: a hidden field only a bot would fill. Accept silently so the
  // bot sees success and does not retry.
  if (form.settings.honeypot && payload._hp) {
    return res.json({ ok: true, message: form.settings.successMessage });
  }
  delete payload._hp;

  const missing = form.fields
    .filter((f) => f.required && !String(payload[f.name] ?? "").trim())
    .map((f) => f.label);
  if (missing.length) {
    throw ApiError.badRequest("Please complete all required fields", { missing });
  }

  // only persist keys the form actually declares
  const allowed = new Set(form.fields.map((f) => f.name));
  const clean = Object.fromEntries(Object.entries(payload).filter(([k]) => allowed.has(k)));

  if (form.settings.storeSubmissions) {
    await FormSubmission.create({
      form: form._id,
      payload: clean,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
  }

  res.json({
    ok: true,
    message: form.settings.successMessage,
    redirect: form.settings.redirectUrl || null,
  });
}));

/* ---------------- site-wide search ----------------
   One request across every content type, each result carrying the section it
   came from so the header can group them. Kept deliberately small and indexed
   on title-ish fields — this feeds a type-ahead, not a research tool. */
router.get("/search", asyncHandler(async (req, res) => {
  const q = String(req.query.q || "").trim();
  const limit = Math.min(Number(req.query.limit) || 8, 20);
  if (q.length < 2) return res.json({ items: [], total: 0, query: q });

  const rx = new RegExp(escapeRegex(q), "i");
  const live = { deletedAt: null, status: "published" };

  const [posts, pages, documents, people, partners] = await Promise.all([
    Post.find({ ...live, $or: [{ title: rx }, { excerpt: rx }] })
      .sort("-publishedAt").limit(limit)
      .populate("contentType", "name slug").select("title slug excerpt contentType").lean(),

    Page.find({ ...live, $or: [{ title: rx }, { "meta.description": rx }] })
      .limit(limit).select("title slug meta").lean(),

    Document.find({ ...live, title: rx })
      .limit(limit).populate("category", "name slug").select("title slug category").lean(),

    Person.find({ ...live, $or: [{ name: rx }, { position: rx }] })
      .limit(limit).populate("group", "name slug").select("name position group").lean(),

    Partner.find({ deletedAt: null, name: rx }).limit(4).select("name url").lean(),
  ]);

  const items = [
    ...posts.map((p) => {
      const type = p.contentType?.slug;
      const section =
        type === "focus-areas" ? "Focus Areas" : type === "programmes" ? "Programmes" : "News & Media";
      const base =
        type === "focus-areas" ? "/focus-areas" : type === "programmes" ? "/programmes" : "/news-and-media";
      return { title: p.title, description: p.excerpt, url: `${base}/${p.slug}`, section };
    }),
    ...pages.map((p) => ({
      title: p.title, description: p.meta?.description, url: `/${p.slug}`, section: "Pages",
    })),
    ...documents.map((d) => ({
      title: d.title,
      description: d.category?.name,
      url: d.category?.slug === "policies" ? "/about-us/our-policies" : `/knowledge-hub/${d.category?.slug || ""}`,
      section: "Knowledge Hub",
    })),
    ...people.map((p) => ({
      title: p.name, description: p.position,
      url: `/about-us/our-people/${p.group?.slug || ""}`, section: "Our People",
    })),
    ...partners.map((p) => ({
      title: p.name, description: "Partner", url: "/about-us/our-partners", section: "Partners",
    })),
  ];

  // exact-ish matches first, then alphabetical, so typing narrows sensibly
  const lower = q.toLowerCase();
  items.sort((a, b) => {
    const rank = (t) => (t.toLowerCase().startsWith(lower) ? 0 : t.toLowerCase().includes(lower) ? 1 : 2);
    return rank(a.title) - rank(b.title) || a.title.localeCompare(b.title);
  });

  res.json({ items: items.slice(0, 24), total: items.length, query: q });
}));

export default router;

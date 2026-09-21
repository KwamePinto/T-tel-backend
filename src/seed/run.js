/**
 * Seeds structure (content types, menus, settings, pages) and migrates the
 * data that was hardcoded in the React front end into MongoDB.
 *
 *   npm run seed           add/update, leave existing content alone
 *   npm run seed -- --reset  wipe collections first (destructive)
 *
 * Safe to run repeatedly: everything is upserted by slug.
 */
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { env, ROOT } from "../config/env.js";
import { connectDb, disconnectDb } from "../config/db.js";
import {
  User, Setting, ContentType, Post, Page, Person, PersonGroup, Partner,
  Menu, MenuItem, Form, Document, DocumentCategory, Media, PartnerGroup,
} from "../models/index.js";
import { toSlug, uniqueSlug } from "../utils/slug.js";
import {
  CONTENT_TYPES, PERSON_GROUPS, DOCUMENT_COLLECTIONS, MENUS,
  MAIN_MENU_ITEMS, FOOTER_ABOUT_ITEMS, FOOTER_LINKS_ITEMS,
  THEME_SETTINGS, AUTH_SETTINGS, CONTACT_FORM, PAGES, OUR_HISTORY_MILESTONES,
} from "./defaults.js";

/**
 * Where the React app lives. The seed reads its original data modules and its
 * public assets from there, which only matters on a first migration — once the
 * content is in Mongo the backend stands alone. Set FRONTEND_DIR when the two
 * are deployed as separate repositories, as they are on Render.
 */
const FRONTEND = process.env.FRONTEND_DIR
  ? path.resolve(process.env.FRONTEND_DIR)
  : [path.resolve(ROOT, ".."), path.resolve(ROOT, "..", "frontend")]
      .find((p) => fs.existsSync(path.join(p, "src", "data"))) || path.resolve(ROOT, "..");
const reset = process.argv.includes("--reset");
const log = (...a) => console.log("  ", ...a);

/** Reads a data module out of the React app so we migrate from one source. */
async function loadFrontend(rel) {
  const file = path.join(FRONTEND, "src", "data", rel);
  if (!fs.existsSync(file)) return null;
  return import(`file://${file.split(path.sep).join("/")}`);
}

/** Registers a front-end public asset as a Media record, without copying it. */
async function mediaFor(publicPath, alt = "") {
  if (!publicPath) return null;
  const clean = String(publicPath).replace(/^\/+/, "");
  const existing = await Media.findOne({ key: clean });
  if (existing) return existing._id;

  const abs = path.join(FRONTEND, "public", clean);
  const stat = fs.existsSync(abs) ? fs.statSync(abs) : null;
  const ext = path.extname(clean).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" :
    ext === ".svg" ? "image/svg+xml" :
    ext === ".webp" ? "image/webp" :
    ext === ".mp4" ? "video/mp4" :
    ext === ".pdf" ? "application/pdf" : "image/jpeg";

  const doc = await Media.create({
    filename: path.basename(clean),
    originalName: path.basename(clean),
    key: clean,
    url: `/${clean}`,
    mime,
    size: stat?.size ?? 0,
    alt,
  });
  return doc._id;
}

async function seedAdmin() {
  const { name, email, password } = env.seedAdmin;
  if (!email || !password) {
    log("! SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin creation");
    return null;
  }
  let user = await User.findOne({ email: email.toLowerCase() });
  if (user) { log(`admin already exists: ${user.email}`); return user; }
  user = await User.create({ name, email, password, role: "admin" });
  log(`created admin: ${user.email}`);
  return user;
}

/** Which tab of the Theme screen a key belongs on, matched most-specific first. */
const SETTING_SECTIONS = [
  [/^(site_|copyright_|footer_text|accent_color|favicon_|logo_)/, "Branding"],
  [/^(default_|enable_)/, "Site Features"],
  [/^(homepage_slug|main_menu|blog_label|posts_per_page|show_blog|cta_)/, "Navigation"],
  [/^footer_/, "Footer"],
  [/^(hero_|home_|show_)/, "Homepage"],
  [/^contact_/, "Contact Details"],
  [/^social_/, "Social Links"],
  [/^(allow_registration|registration_)/, "Registration"],
];

const SETTING_OPTIONS = {
  default_theme: ["light", "dark", "system"],
  default_font_size: ["small", "medium", "large"],
  default_language: ["en"],
  registration_role: ["user", "author", "editor"],
  social_facebook_icon: ["facebook", "twitter", "instagram", "linkedin", "youtube", "flickr"],
  social_twitter_icon: ["facebook", "twitter", "instagram", "linkedin", "youtube", "flickr"],
  social_instagram_icon: ["facebook", "twitter", "instagram", "linkedin", "youtube", "flickr"],
  social_linkedin_icon: ["facebook", "twitter", "instagram", "linkedin", "youtube", "flickr"],
  social_youtube_icon: ["facebook", "twitter", "instagram", "linkedin", "youtube", "flickr"],
  social_flickr_icon: ["facebook", "twitter", "instagram", "linkedin", "youtube", "flickr"],
};

/** "home_who_button_label" -> "Who button label" (the prefix is the section). */
function labelFor(key) {
  const words = key.replace(/^(home_|site_|social_|contact_|footer_|hero_)/, "").split("_");
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sectionFor(key) {
  return SETTING_SECTIONS.find(([re]) => re.test(key))?.[1] || "General";
}

async function seedSettings() {
  for (const [group, defs] of [["theme", THEME_SETTINGS], ["auth", AUTH_SETTINGS]]) {
    let order = 0;
    for (const [key, { value, type, label, section, hint }] of Object.entries(defs)) {
      await Setting.updateOne(
        { key },
        {
          $set: {
            group,
            type,
            label: label || labelFor(key),
            section: section || sectionFor(key),
            hint: hint || "",
            options: SETTING_OPTIONS[key],
            sortOrder: (order += 10),
          },
          $setOnInsert: { value },
        },
        { upsert: true },
      );
    }
  }
  log(`settings: ${Object.keys(THEME_SETTINGS).length} theme, ${Object.keys(AUTH_SETTINGS).length} auth`);
}

async function seedStructure() {
  for (const t of CONTENT_TYPES) {
    await ContentType.updateOne({ slug: t.slug }, { $set: t }, { upsert: true });
  }
  for (const g of PERSON_GROUPS) {
    await PersonGroup.updateOne({ slug: g.slug }, { $set: g }, { upsert: true });
  }
  for (const c of DOCUMENT_COLLECTIONS) {
    await DocumentCategory.updateOne({ slug: c.slug }, { $set: c }, { upsert: true });
  }
  for (const p of PAGES) {
    await Page.updateOne(
      { slug: p.slug },
      { $set: { template: p.template, status: p.status, isSystem: !!p.isSystem }, $setOnInsert: { title: p.title } },
      { upsert: true },
    );
  }
  await Form.updateOne({ slug: CONTACT_FORM.slug }, { $setOnInsert: CONTACT_FORM }, { upsert: true });
  log(`structure: ${CONTENT_TYPES.length} types, ${PERSON_GROUPS.length} people groups, ${PAGES.length} pages`);
}

async function seedMenus() {
  for (const m of MENUS) {
    await Menu.updateOne({ slug: m.slug }, { $set: m }, { upsert: true });
  }
  const trees = [
    ["main", MAIN_MENU_ITEMS],
    ["about-us", FOOTER_ABOUT_ITEMS],
    ["footer-ii", FOOTER_LINKS_ITEMS],
  ];
  for (const [slug, items] of trees) {
    const menu = await Menu.findOne({ slug });
    if (await MenuItem.countDocuments({ menu: menu._id })) continue; // don't clobber edits
    let order = 0;
    for (const item of items) {
      const parent = await MenuItem.create({
        menu: menu._id, label: item.label, url: item.url, sortOrder: order++,
      });
      let childOrder = 0;
      for (const child of item.children || []) {
        await MenuItem.create({
          menu: menu._id, parent: parent._id, label: child.label, url: child.url, sortOrder: childOrder++,
        });
      }
    }
  }
  log(`menus: ${MENUS.length}`);
}

/**
 * Focus Areas, Programmes and Knowledge Hub need dropdowns just like About Us.
 * Their children are the actual content, so the nav can't drift from the site.
 * Idempotent and additive: an item already present (by URL, under that parent)
 * is left alone, so anything the client reorders or renames survives a re-seed.
 */
async function seedNavChildren() {
  const menu = await Menu.findOne({ slug: "main" });
  if (!menu) return;

  const bySlug = async (typeSlug) => {
    const type = await ContentType.findOne({ slug: typeSlug });
    if (!type) return [];
    return Post.find({ contentType: type._id, status: "published", deletedAt: null })
      .sort("sortOrder title")
      .select("title slug")
      .lean();
  };

  const [focus, programmes, collections, people] = await Promise.all([
    bySlug("focus-areas"),
    bySlug("programmes"),
    DocumentCategory.find().sort("sortOrder name").select("name slug").lean(),
    PersonGroup.find().sort("sortOrder name").select("name slug").lean(),
  ]);

  const groups = [
    ["Focus Areas", focus.map((p) => ({ label: p.title, url: `/focus-areas/${p.slug}` }))],
    ["Programmes", programmes.map((p) => ({ label: p.title, url: `/programmes/${p.slug}` }))],
    ["Knowledge Hub", collections.map((c) => ({ label: c.name, url: `/knowledge-hub?collection=${c.slug}` }))],
    // third level: Our People is itself a child of About Us, and keeps its own
    // link to the index page while listing the categories beneath it
    ["Our People", people.map((g) => ({ label: g.name, url: `/about-us/our-people/${g.slug}` }))],
  ];

  let added = 0;
  for (const [parentLabel, children] of groups) {
    const parent = await MenuItem.findOne({ menu: menu._id, label: parentLabel });
    if (!parent || !children.length) continue;

    const existing = await MenuItem.find({ menu: menu._id, parent: parent._id }).select("url").lean();
    const have = new Set(existing.map((e) => e.url));
    let order = existing.length;

    for (const child of children) {
      if (have.has(child.url)) continue;
      await MenuItem.create({
        menu: menu._id, parent: parent._id, label: child.label, url: child.url, sortOrder: order++,
      });
      added++;
    }
  }
  log(`nav children: +${added}`);
}

/**
 * The imported Our History body is Elementor leftovers — placeholder captions
 * ("Timeline Item 1"), images hotlinked from a third-party staging server and
 * links back to the old WordPress site. Replace it with the structured phase
 * timeline and rewrite any remaining outbound link to its local equivalent.
 */
const LEGACY_LINK_MAP = [
  [/https?:\/\/(www\.)?t-tel\.org\/our-work\/t-shel\/?/gi, "/programmes/t-shel"],
  [/https?:\/\/(www\.)?t-tel\.org\/our-work\/delivered\/?/gi, "/programmes/delivered"],
  [/https?:\/\/(www\.)?t-tel\.org\/our-work\/edtech-hub\/?/gi, "/programmes/edtech-hub"],
  [/https?:\/\/(www\.)?t-tel\.org\/download\/[^"']*/gi, "/knowledge-hub"],
  [/https?:\/\/(www\.)?t-tel\.org\/t-tel-history-details\/?/gi, "/about-us/our-history"],
  [/https?:\/\/(www\.)?t-tel\.org\/our-work\/?/gi, "/programmes"],
  [/https?:\/\/(www\.)?t-tel\.org\/?(?=["'])/gi, "/"],
];

async function seedOurHistory() {
  const page = await Page.findOne({ slug: "about-us/our-history" });
  if (!page) return log("! our-history page missing — skipped");

  const existing = (page.sections || []).filter((s) => s.type !== "timeline" && s.type !== "milestones");
  page.sections = [OUR_HISTORY_MILESTONES, ...existing];
  await page.save();
  log("our history: milestones section set");
}

/** Rewrites old-site URLs to local routes across every page and post body. */
async function relinkLegacyUrls() {
  let changed = 0;
  for (const Model of [Page, Post]) {
    const docs = await Model.find({ body: /t-tel\.org/i }).select("body");
    for (const doc of docs) {
      const before = doc.body;
      let body = doc.body;
      for (const [re, to] of LEGACY_LINK_MAP) body = body.replace(re, to);
      if (body !== before) {
        doc.body = body;
        await doc.save();
        changed++;
      }
    }
  }
  log(`relinked legacy URLs in ${changed} record(s)`);
}

async function seedFocusAreas(author) {
  const mod = await loadFrontend("focusAreas.js");
  if (!mod?.FOCUS_AREAS) return log("! focusAreas.js not found — skipped");
  const type = await ContentType.findOne({ slug: "focus-areas" });

  let n = 0;
  for (const [i, area] of mod.FOCUS_AREAS.entries()) {
    const image = await mediaFor(area.image, area.title);
    const body = (area.body || []).map((p) => `<p>${p}</p>`).join("\n");
    await Post.updateOne(
      { slug: area.slug },
      {
        $set: {
          contentType: type._id, title: area.title, excerpt: area.blurb, body,
          featuredImage: image, status: "published", accent: area.accent,
          number: area.number, sortOrder: i, author: author?._id,
        },
        $setOnInsert: { publishedAt: new Date() },
      },
      { upsert: true },
    );
    n++;
  }
  log(`focus areas: ${n}`);
}

async function seedProgrammes(author) {
  const mod = await loadFrontend("projects.js");
  if (!mod?.PROJECTS) return log("! projects.js not found — skipped");
  const type = await ContentType.findOne({ slug: "programmes" });

  let n = 0;
  for (const [i, p] of mod.PROJECTS.entries()) {
    const image = await mediaFor(p.image, p.title);
    const body = (p.description || []).map((x) => `<p>${x}</p>`).join("\n");
    await Post.updateOne(
      { slug: p.slug },
      {
        $set: {
          contentType: type._id, title: p.title, excerpt: p.summary, body,
          featuredImage: image, status: "published", sortOrder: i, author: author?._id,
          meta: { description: p.partner },
        },
        $setOnInsert: { publishedAt: new Date() },
      },
      { upsert: true },
    );
    n++;
  }
  log(`programmes: ${n}`);
}

async function seedNews(author) {
  const mod = await loadFrontend("news.js");
  if (!mod?.LATEST_NEWS) return log("! news.js not found — skipped");
  const type = await ContentType.findOne({ slug: "blog" });

  let n = 0;
  for (const item of mod.LATEST_NEWS) {
    const image = await mediaFor(item.image, item.title);
    const slug = item.slug || toSlug(item.title);
    await Post.updateOne(
      { slug },
      {
        $set: {
          contentType: type._id, title: item.title, excerpt: item.excerpt,
          featuredImage: image, status: "published", author: author?._id,
        },
        $setOnInsert: {
          body: `<p>${item.excerpt}</p>`,
          publishedAt: new Date(item.date || Date.now()),
        },
      },
      { upsert: true },
    );
    n++;
  }
  log(`news posts: ${n}`);
}

async function seedPeople() {
  const groups = await PersonGroup.find().lean();
  const bySlug = Object.fromEntries(groups.map((g) => [g.slug, g._id]));
  const dir = path.join(FRONTEND, "src", "data", "team");
  if (!fs.existsSync(dir)) return log("! team data not found — skipped");

  let n = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const groupId = bySlug[data.slug];
    if (!groupId) continue;

    for (const [i, person] of (data.people || []).entries()) {
      if (!person.name) continue;
      const photo = await mediaFor(person.photo, person.name);
      const slug = await uniqueSlug(Person, person.name);
      const existing = await Person.findOne({ name: person.name, group: groupId });
      if (existing) {
        existing.position = person.position || existing.position;
        existing.bio = person.bio || existing.bio;
        if (photo) existing.photo = photo;
        existing.sortOrder = i;
        await existing.save();
      } else {
        await Person.create({
          name: person.name, slug, position: person.position || "",
          group: groupId, photo, bio: person.bio || "", sortOrder: i, status: "published",
        });
      }
      n++;
    }
  }
  log(`people: ${n}`);
}

async function seedPartners() {
  const mod = await loadFrontend("partners.js");
  if (!mod) return log("! partners.js not found — skipped");

  const sets = [
    [mod.GOVERNMENT_PARTNERS, "government"],
    [mod.UNIVERSITY_PARTNERS, "university"],
    [mod.FUNDING_PARTNERS, "funder"],
  ];

  let n = 0;
  for (const [list, group] of sets) {
    for (const [i, p] of (list || []).entries()) {
      const logo = await mediaFor(p.logo, p.name);
      const slug = toSlug(p.name);
      await Partner.updateOne(
        { slug },
        {
          $set: {
            name: p.name, groups: [group], group, logo, description: p.description || "",
            sortOrder: i, showOnHome: group === "funder",
            isPrincipal: p.name === "Mastercard Foundation",
          },
        },
        { upsert: true },
      );
      n++;
    }
  }
  log(`partners: ${n}`);
}

async function seedPolicyDocuments() {
  const mod = await loadFrontend("policies.js");
  if (!mod?.POLICIES) return log("! policies.js not found — skipped");
  const col = await DocumentCategory.findOne({ slug: "policies" });

  let n = 0;
  for (const [i, p] of mod.POLICIES.entries()) {
    // placeholder file record; the real PDF is attached during document ingest
    const existing = await Document.findOne({ slug: p.slug });
    if (existing) continue;
    const thumb = await mediaFor(p.image, p.title);
    await Document.create({
      title: p.title, slug: p.slug, description: p.description || "",
      category: col?._id, file: thumb, thumbnail: thumb,
      status: "draft", sortOrder: i,
    });
    n++;
  }
  log(`policy documents: ${n} (status=draft until real PDFs are ingested)`);
}

async function main() {
  console.log(`\n[seed] connecting…`);
  await connectDb();

  if (reset) {
    console.log("[seed] --reset: clearing content collections");
    await Promise.all([
      Post.deleteMany({}), Page.deleteMany({}), Person.deleteMany({}),
      PersonGroup.deleteMany({}), Partner.deleteMany({}), PartnerGroup.deleteMany({}), Menu.deleteMany({}),
      MenuItem.deleteMany({}), ContentType.deleteMany({}), Media.deleteMany({}),
      Document.deleteMany({}), DocumentCategory.deleteMany({}), Setting.deleteMany({}),
    ]);
  }

  console.log("[seed] structure");
  const admin = await seedAdmin();
  await seedSettings();
  await seedStructure();
  await seedMenus();

  console.log("[seed] content");
  await seedFocusAreas(admin);
  await seedProgrammes(admin);
  await seedNews(admin);
  await seedPeople();
  await seedPartners();
  await seedPolicyDocuments();
  // runs last: its children are built from the content seeded above
  await seedNavChildren();
  await seedOurHistory();
  await relinkLegacyUrls();

  const counts = {
    posts: await Post.countDocuments(),
    pages: await Page.countDocuments(),
    people: await Person.countDocuments(),
    partners: await Partner.countDocuments(),
    media: await Media.countDocuments(),
  };
  console.log("\n[seed] done:", counts, "\n");

  await disconnectDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n[seed] failed:", err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});

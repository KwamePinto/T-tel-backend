import mongoose from "mongoose";

export const TEMPLATES = ["default", "full-width", "landing", "inner", "contact"];

/**
 * Pages come in two kinds, and the difference is who can create one.
 *
 * A "custom" page is the ordinary sort: a hero and a block of rich text,
 * rendered by the catch-all route on the site. Every page the admin creates is
 * one of these, they all share a single editor, and no developer is involved.
 *
 * A "special" page is backed by its own coded component — Our History's
 * timeline, Who We Are's vision and principles — so its content lives in
 * `sections` as structured data rather than as prose, and it gets an editor
 * built for exactly those fields. Adding one means a developer writes the
 * component and a blueprint describing its fields (see the admin's
 * pageBlueprints folder), which is why `kind` is not something the admin UI
 * ever lets you change: a page cannot become special without code behind it.
 */
export const PAGE_KINDS = ["special", "custom"];

/**
 * Which of the main menus a page belongs under.
 *
 * This is more than filing: it decides the shape of the page. A custom page
 * under About Us is laid out as an account, with its heading held beside the
 * text; one under Focus Areas gets a reading column with a panel pinned
 * alongside; one under Programmes gets the banded treatment with its figures
 * set apart. They share one editor — the fields are the same — and the menu
 * decides how those fields are arranged, which is what lets an admin add a
 * page anywhere in the site and have it come out looking like it belongs.
 *
 * Empty means a standalone page sitting at the top level, rendered as plain
 * prose under its hero.
 */
export const PAGE_SECTIONS = ["", "about-us", "focus-areas", "programmes"];

const pageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // custom is the default because it is the only kind anything can create
    // without a developer also shipping a component for it
    kind: { type: String, enum: PAGE_KINDS, default: "custom", index: true },
    section: { type: String, enum: PAGE_SECTIONS, default: "", index: true },
    body: { type: String, default: "" },

    // the panel that stays beside the text on the Focus Areas layout, and the
    // figures band on the Programmes one — same shape as a post's
    keyInfo: {
      label: { type: String, default: "" },
      title: { type: String, default: "" },
      html: { type: String, default: "" },
      linkLabel: { type: String, default: "" },
      linkUrl: { type: String, default: "" },
    },
    template: { type: String, enum: TEMPLATES, default: "default" },
    status: { type: String, enum: ["draft", "published", "scheduled"], default: "draft", index: true },
    publishedAt: Date,
    showInNav: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    heroImage: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },

    meta: {
      heroLabel: String,
      heroTitle: String,
      heroDescription: String,
      title: String,
      description: String,
      canonical: String,
      noindex: { type: Boolean, default: false },
    },

    // Ordered, typed blocks so a page's layout is editable rather than being
    // hidden in theme settings. Empty means "render the body only".
    sections: [
      {
        _id: false,
        type: { type: String },
        enabled: { type: Boolean, default: true },
        data: mongoose.Schema.Types.Mixed,
      },
    ],

    isSystem: { type: Boolean, default: false },

    /**
     * Per-language overrides, as { fr: { title, body, … } }.
     *
     * Only the fields that have been translated need to be present — the API
     * falls back field by field, so a record can be translated a piece at a
     * time and stay readable throughout. See utils/localise.js.
     */
    translations: { type: mongoose.Schema.Types.Mixed, default: {} },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

/**
 * A custom page filed under a menu lives at that menu's address, so the URL
 * matches where the page actually sits in the site.
 *
 * Only custom pages: a special page's slug is fixed by the route its component
 * is mounted on. The two guards matter — a slug already under the section is
 * left alone so re-saving cannot nest it twice, and a slug equal to the
 * section is the menu's own landing page, which must not become
 * "about-us/about-us".
 */
pageSchema.pre("save", function prefixSlugWithSection(next) {
  const { section, slug, kind } = this;
  if (kind === "custom" && section && slug && slug !== section && !slug.startsWith(`${section}/`)) {
    this.slug = `${section}/${slug}`;
  }
  next();
});

export const Page = mongoose.model("Page", pageSchema);

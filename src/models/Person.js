import mongoose from "mongoose";

// Fixes a flaw in the live system, where each of ~85 team members was stored
// as a Page. People are their own model: grouped, ordered and searchable.
const personSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    position: { type: String, default: "", trim: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: "PersonGroup", required: true, index: true },
    photo: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
    bio: { type: String, default: "" },
    email: { type: String, default: "" },
    linkedin: { type: String, default: "" },
    tag: { type: String, default: "" }, // no longer shown on the site — see git history
    status: { type: String, enum: ["draft", "published"], default: "published", index: true },
    sortOrder: { type: Number, default: 0 },

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

personSchema.index({ name: "text", position: "text", bio: "text" });

export const Person = mongoose.model("Person", personSchema);

const personGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // the short one-liner shown next to the heading on every category page
    description: { type: String, default: "" },
    // a longer account, shown as a drop-capped paragraph above the photo grid
    // on categories that have one (currently Subscribers and Board of
    // Directors) — left blank, a category simply shows no intro paragraph
    intro: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const PersonGroup = mongoose.model("PersonGroup", personGroupSchema);

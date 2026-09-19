import mongoose from "mongoose";

export const TEMPLATES = ["default", "full-width", "landing", "inner", "contact"];

const pageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    body: { type: String, default: "" },
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
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

export const Page = mongoose.model("Page", pageSchema);

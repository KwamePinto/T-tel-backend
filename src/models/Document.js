import mongoose from "mongoose";

// Knowledge Hub library. The live site had no model for this at all — its
// documents were WordPress-era downloads that never made it across.
const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: "" },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "DocumentCategory", index: true },
    file: { type: mongoose.Schema.Types.ObjectId, ref: "Media", required: true },
    thumbnail: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
    year: { type: Number, index: true },
    tags: [String],
    downloads: { type: Number, default: 0 },
    // sha1 of the ingested file, so a re-run can skip what it already imported
    sourceHash: { type: String, default: null, index: true },
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

documentSchema.index({ title: "text", description: "text", tags: "text" });
// the shape every Knowledge Hub listing uses: a collection's published files
documentSchema.index({ category: 1, status: 1, deletedAt: 1, createdAt: -1 });

export const Document = mongoose.model("Document", documentSchema);

const collectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: "" },
    icon: { type: String, default: "" },
    // Knowledge Hub nests one level: Teacher Education holds B.Ed. Resources,
    // College Leadership & Management and the rest. Null means top level.
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "DocumentCategory", default: null, index: true },
    // per-language overrides, as { fr: { name } } — see utils/localise.js
    translations: { type: mongoose.Schema.Types.Mixed, default: {} },

    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const DocumentCategory = mongoose.model("DocumentCategory", collectionSchema);

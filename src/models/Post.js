import mongoose from "mongoose";

export const STATUSES = ["draft", "published", "scheduled"];

const postSchema = new mongoose.Schema(
  {
    contentType: { type: mongoose.Schema.Types.ObjectId, ref: "ContentType", required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    excerpt: { type: String, default: "" },
    body: { type: String, default: "" },
    featuredImage: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
    status: { type: String, enum: STATUSES, default: "draft", index: true },
    publishedAt: { type: Date, index: true },
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag", index: true }],

    // Focus Areas use these; harmless for Blog posts.
    accent: { type: String, default: "" },
    number: { type: String, default: "" },

    meta: {
      title: String,
      description: String,
      canonical: String,
      noindex: { type: Boolean, default: false },
    },
    sortOrder: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

// A post is publicly visible when published and its publish time has passed.
postSchema.statics.publicFilter = function publicFilter(extra = {}) {
  return { deletedAt: null, status: "published", publishedAt: { $lte: new Date() }, ...extra };
};

postSchema.index({ title: "text", excerpt: "text", body: "text" });

export const Post = mongoose.model("Post", postSchema);

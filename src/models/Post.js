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

    /**
     * Laid-out page content, for the Focus Area and Programme pages whose
     * copy alternates with imagery rather than running as one column.
     *
     *   prose   a block of rich text
     *   split   a half-and-half row, image one side and text the other
     *   image   a full-width figure
     *   facts   a narrow panel of details beside the narrative
     *
     * `body` stays the fallback: a post with no sections renders that, so
     * every existing post and the whole Blog are unaffected.
     */
    sections: [
      {
        _id: false,
        type: { type: String, enum: ["prose", "split", "image", "facts"], default: "prose" },
        html: { type: String, default: "" },
        aside: { type: String, default: "" },
        image: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
        // image on the right rather than the left, so rows can alternate
        flip: { type: Boolean, default: false },
      },
    ],

    /**
     * The panel that stays pinned beside the narrative on a focus area —
     * delivery partners, the figures that matter, whatever this particular
     * page needs a reader to keep in view while they scroll.
     *
     * Per post rather than a site-wide block, because the whole point of it
     * is to say something about the page it sits on. A post that leaves it
     * empty simply renders without the panel.
     */
    keyInfo: {
      label: { type: String, default: "" },
      title: { type: String, default: "" },
      html: { type: String, default: "" },
      linkLabel: { type: String, default: "" },
      linkUrl: { type: String, default: "" },
    },

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

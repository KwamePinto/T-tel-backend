import mongoose from "mongoose";

// User-definable post types (Blog, Focus Areas, Programmes …), exactly as the
// live system models them.
const contentTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: "" },
    icon: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    // locked types are seeded and cannot be deleted, only renamed
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const ContentType = mongoose.model("ContentType", contentTypeSchema);

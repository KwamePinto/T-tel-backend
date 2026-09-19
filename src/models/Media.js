import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    // storage key: path on disk relative to UPLOAD_DIR, or object key in S3
    key: { type: String, required: true },
    url: { type: String, required: true },
    mime: { type: String, required: true, index: true },
    size: { type: Number, required: true },
    width: Number,
    height: Number,
    alt: { type: String, default: "" },
    caption: { type: String, default: "" },
    folder: { type: mongoose.Schema.Types.ObjectId, ref: "MediaFolder", default: null, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

mediaSchema.virtual("kind").get(function kind() {
  if (this.mime?.startsWith("image/")) return "image";
  if (this.mime?.startsWith("video/")) return "video";
  if (this.mime === "application/pdf") return "pdf";
  return "file";
});

mediaSchema.set("toJSON", { virtuals: true });
mediaSchema.index({ originalName: "text", alt: "text" });

export const Media = mongoose.model("Media", mediaSchema);

const folderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "MediaFolder", default: null, index: true },
  },
  { timestamps: true },
);

export const MediaFolder = mongoose.model("MediaFolder", folderSchema);

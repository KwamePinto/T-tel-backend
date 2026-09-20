import mongoose from "mongoose";

// Groups are database records; these values remain seed defaults for migrations.
export const PARTNER_GROUPS = ["funder", "government", "university", "implementing", "research"];

const partnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    group: { type: String, required: true, default: "funder", index: true },
    logo: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
    description: { type: String, default: "" },
    url: { type: String, default: "" },
    isPrincipal: { type: Boolean, default: false },
    showOnHome: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

export const Partner = mongoose.model("Partner", partnerSchema);

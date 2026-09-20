import mongoose from "mongoose";

const partnerGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

export const PartnerGroup = mongoose.model("PartnerGroup", partnerGroupSchema);

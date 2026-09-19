import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    excerpt: { type: String, default: "" },
    description: { type: String, default: "" },
    startAt: { type: Date, required: true, index: true },
    endAt: Date,
    location: { type: String, default: "" },
    address: { type: String, default: "" },
    coverImage: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "EventCategory", index: true },
    status: { type: String, enum: ["draft", "published", "cancelled"], default: "draft", index: true },
    capacity: Number,
    isFeatured: { type: Boolean, default: false },
    regType: { type: String, enum: ["none", "form", "url"], default: "none" },
    form: { type: mongoose.Schema.Types.ObjectId, ref: "Form" },
    registrationUrl: { type: String, default: "" },
    brochure: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
    brochureUrl: { type: String, default: "" },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

export const Event = mongoose.model("Event", eventSchema);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: "" },
  },
  { timestamps: true },
);

export const EventCategory = mongoose.model("EventCategory", categorySchema);

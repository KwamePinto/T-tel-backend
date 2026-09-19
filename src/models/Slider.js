import mongoose from "mongoose";

const slideSchema = new mongoose.Schema(
  {
    _id: false,
    image: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
    video: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
    title: { type: String, default: "" },
    caption: { type: String, default: "" },
    buttonLabel: { type: String, default: "" },
    buttonUrl: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false },
);

const sliderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    autoplay: { type: Boolean, default: true },
    intervalMs: { type: Number, default: 5000 },
    slides: [slideSchema],
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

export const Slider = mongoose.model("Slider", sliderSchema);

import mongoose from "mongoose";

export const MENU_LOCATIONS = ["header", "footer", "sidebar"];

const menuSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    location: { type: String, enum: MENU_LOCATIONS, default: "header", index: true },
  },
  { timestamps: true },
);

export const Menu = mongoose.model("Menu", menuSchema);

// Items may point at a typed URL or be bound to a Page / Post / Person, so
// renaming or re-slugging that record keeps the menu correct.
const menuItemSchema = new mongoose.Schema(
  {
    menu: { type: mongoose.Schema.Types.ObjectId, ref: "Menu", required: true, index: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem", default: null, index: true },
    label: { type: String, required: true, trim: true },
    url: { type: String, default: "" },
    linkType: { type: String, enum: ["url", "page", "post", "person", "contentType"], default: "url" },
    linkRef: { type: mongoose.Schema.Types.ObjectId, default: null },
    target: { type: String, enum: ["_self", "_blank"], default: "_self" },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const MenuItem = mongoose.model("MenuItem", menuItemSchema);

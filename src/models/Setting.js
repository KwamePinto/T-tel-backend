import mongoose from "mongoose";

// Flat key/value store backing Theme + Authentication settings, mirroring the
// structure the client already knows. `group` drives which admin screen a key
// appears on, `type` drives which input the dashboard renders.
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: mongoose.Schema.Types.Mixed,
    group: { type: String, default: "theme", index: true },
    // presentation metadata, so the dashboard renders settings without
    // duplicating a field schema on the client
    label: { type: String, default: "" },
    section: { type: String, default: "General" },
    hint: { type: String, default: "" },
    options: { type: [String], default: undefined },
    sortOrder: { type: Number, default: 0 },
    type: {
      type: String,
      enum: ["text", "textarea", "richtext", "number", "boolean", "color", "select", "media", "menu", "form"],
      default: "text",
    },
  },
  { timestamps: true },
);

settingSchema.statics.schemaFor = async function schemaFor(group) {
  return this.find(group ? { group } : {}).sort("sortOrder key").lean();
};

settingSchema.statics.asObject = async function asObject(group) {
  const rows = await this.find(group ? { group } : {}).lean();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
};

settingSchema.statics.setMany = async function setMany(entries, group = "theme") {
  const ops = Object.entries(entries).map(([key, value]) => ({
    updateOne: {
      filter: { key },
      update: { $set: { value, group } },
      upsert: true,
    },
  }));
  if (ops.length) await this.bulkWrite(ops);
};

export const Setting = mongoose.model("Setting", settingSchema);

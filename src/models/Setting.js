import mongoose from "mongoose";

// Flat key/value store backing Theme + Authentication settings, mirroring the
// structure the client already knows. `group` drives which admin screen a key
// appears on, `type` drives which input the dashboard renders.
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: mongoose.Schema.Types.Mixed,
    /**
     * Per-language values, as { fr: "…" }.
     *
     * The home page is built almost entirely from settings, so without this a
     * site in French would still greet its readers in English. Falls back to
     * `value` per key, so a setting with no French simply stays English.
     */
    translations: { type: mongoose.Schema.Types.Mixed, default: {} },
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

settingSchema.statics.asObject = async function asObject(group, lang) {
  const rows = await this.find(group ? { group } : {}).lean();
  return Object.fromEntries(
    rows.map((r) => {
      const translated = lang && lang !== "en" ? r.translations?.[lang] : null;
      const useTranslation =
        translated !== null && translated !== undefined &&
        !(typeof translated === "string" && !translated.trim());
      return [r.key, useTranslation ? translated : r.value];
    }),
  );
};

/**
 * Writes translations[lang] for each key, scoped to `group` so a key from a
 * different settings screen sharing the same name is untouched. Merges into
 * whatever French is already on the row rather than replacing it wholesale,
 * so saving the Theme screen cannot clear a value entered on another one.
 */
settingSchema.statics.setTranslations = async function setTranslations(byLang, group = "theme") {
  const ops = [];
  for (const [lang, entries] of Object.entries(byLang || {})) {
    for (const [key, value] of Object.entries(entries || {})) {
      ops.push({
        updateOne: {
          filter: { key, group },
          update: { $set: { [`translations.${lang}`]: value } },
        },
      });
    }
  }
  if (ops.length) await this.bulkWrite(ops);
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

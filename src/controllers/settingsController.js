import { Setting } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getSettings = asyncHandler(async (req, res) => {
  const group = req.params.group || req.query.group;
  const lang = String(req.query.lang || "").trim().toLowerCase();
  res.json(await Setting.asObject(group, lang));
});

/** Full rows (label, section, type, options) so the dashboard can render the
 *  settings form without a second copy of the field definitions. */
export const getSettingsSchema = asyncHandler(async (req, res) => {
  res.json({ fields: await Setting.schemaFor(req.params.group) });
});

/**
 * Takes { values, translations } rather than a flat map, so a French value
 * can be saved beside the English one it replaces in the same request. Where
 * `values` is absent the whole body is treated as the flat map, which keeps
 * this compatible with any caller that predates the split.
 */
export const saveSettings = asyncHandler(async (req, res) => {
  const group = req.params.group || "theme";
  const body = req.body || {};
  const values = body.values && typeof body.values === "object" ? body.values : body;
  await Setting.setMany(values, group);
  if (body.translations && typeof body.translations === "object") {
    await Setting.setTranslations(body.translations, group);
  }
  res.json({ ok: true, settings: await Setting.asObject(group) });
});

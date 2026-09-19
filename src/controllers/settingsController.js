import { Setting } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getSettings = asyncHandler(async (req, res) => {
  const group = req.params.group || req.query.group;
  res.json(await Setting.asObject(group));
});

/** Full rows (label, section, type, options) so the dashboard can render the
 *  settings form without a second copy of the field definitions. */
export const getSettingsSchema = asyncHandler(async (req, res) => {
  res.json({ fields: await Setting.schemaFor(req.params.group) });
});

export const saveSettings = asyncHandler(async (req, res) => {
  const group = req.params.group || "theme";
  await Setting.setMany(req.body || {}, group);
  res.json({ ok: true, settings: await Setting.asObject(group) });
});

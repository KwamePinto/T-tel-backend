import slugify from "slugify";

export const toSlug = (value) =>
  slugify(String(value || ""), { lower: true, strict: true, trim: true });

// Produces a slug that is unique within a collection, appending -2, -3, …
export async function uniqueSlug(Model, value, { ignoreId = null, field = "slug" } = {}) {
  const base = toSlug(value) || "item";
  let candidate = base;
  let n = 1;

  for (;;) {
    const query = { [field]: candidate };
    if (ignoreId) query._id = { $ne: ignoreId };
    const clash = await Model.exists(query);
    if (!clash) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

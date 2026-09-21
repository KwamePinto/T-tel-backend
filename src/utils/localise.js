/**
 * Swaps a record's translated fields in, field by field.
 *
 * The fallback is per field rather than per record on purpose: a page whose
 * title has been translated but whose body has not should come back with a
 * French title and English body, not drop back to English wholesale. That is
 * what lets a site be translated a piece at a time and stay readable
 * throughout, instead of needing every field done before any of it shows.
 *
 * An empty string counts as "not translated". Without that, clearing a field
 * in the admin would blank it on the site rather than revert it to English.
 */
export const DEFAULT_LANG = "en";

const isPlainObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);

function localiseDoc(doc, lang) {
  if (!doc || typeof doc !== "object") return doc;
  const translated = lang ? doc.translations?.[lang] : null;
  const out = { ...doc };
  // never served: it is the source material, not part of the record
  delete out.translations;
  if (!isPlainObject(translated)) return out;

  for (const [field, value] of Object.entries(translated)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;

    // A grouped field like `meta` is merged a level down rather than swapped
    // whole, so translating just the hero title cannot drop the description
    // and the canonical URL along with it. Arrays are replaced — a translated
    // list of sections is the whole list, not a patch over it.
    out[field] = isPlainObject(value) && isPlainObject(out[field])
      ? { ...out[field], ...value }
      : value;
  }
  return out;
}

/**
 * Walks whatever a route is about to send — a document, a list, or a wrapper
 * like `{ items: [...] }` — so routes need no changes of their own.
 */
export function localise(body, lang) {
  if (!body || typeof body !== "object") return body;
  // Note this runs for English too, so the translations blob is stripped from
  // every public response rather than being shipped to readers who cannot use
  // it. `lang` of "en" simply finds no overrides to apply.
  if (Array.isArray(body)) return body.map((entry) => localise(entry, lang));

  // a list wrapper: localise the rows, leave the paging counts alone
  if (Array.isArray(body.items)) {
    return { ...body, items: body.items.map((entry) => localiseDoc(entry, lang)) };
  }
  return localiseDoc(body, lang);
}

import { asyncHandler } from "../utils/asyncHandler.js";
import { escapeRegex } from "../utils/escapeRegex.js";
import { ApiError } from "../utils/ApiError.js";
import { uniqueSlug } from "../utils/slug.js";

/**
 * Builds the standard list/read/create/update/trash/restore/destroy handlers.
 * Resources with genuinely different behaviour (media, forms, settings) get
 * their own controllers instead of bending this one out of shape.
 *
 * @param {import("mongoose").Model} Model
 * @param {object} opts
 * @param {string[]} opts.searchable      fields matched by ?search=
 * @param {string}   opts.slugFrom        field a slug is derived from
 * @param {string[]} opts.populate        refs to populate on read
 * @param {boolean}  opts.softDelete      use deletedAt instead of removing
 * @param {string}   opts.defaultSort
 * @param {(req) => object} opts.baseFilter  extra filter applied to every query
 */
export function crudFactory(Model, opts = {}) {
  const {
    searchable = ["title", "name"],
    slugFrom = "title",
    populate = [],
    softDelete = true,
    defaultSort = "-createdAt",
    baseFilter = () => ({}),
    allowedFilters = ["status", "contentType", "group", "collection", "category", "menu", "folder"],
    filterMap = {},
    transform = null,
  } = opts;

  const applyPopulate = (q) => populate.reduce((acc, p) => acc.populate(p), q);

  const list = asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 20,
      search = "",
      sort = defaultSort,
      trashed = "false",
      ...rest
    } = req.query;

    const filter = { ...baseFilter(req) };
    if (softDelete) filter.deletedAt = trashed === "true" ? { $ne: null } : null;

    for (const key of allowedFilters) {
      if (rest[key] !== undefined && rest[key] !== "" && rest[key] !== "all") {
        filter[filterMap[key] || key] = rest[key];
      }
    }

    if (search && searchable.length) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = searchable.map((f) => ({ [f]: rx }));
    }

    const perPage = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page), 1) - 1) * perPage;

    const [items, total] = await Promise.all([
      applyPopulate(Model.find(filter).sort(sort).skip(skip).limit(perPage)).lean({ virtuals: true }),
      Model.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: Number(page),
      pages: Math.ceil(total / perPage) || 1,
      limit: perPage,
    });
  });

  const read = asyncHandler(async (req, res) => {
    const doc = await applyPopulate(Model.findById(req.params.id));
    if (!doc) throw ApiError.notFound(`${Model.modelName} not found`);
    res.json(doc);
  });

  const create = asyncHandler(async (req, res) => {
    const payload = transform ? await transform({ ...req.body }, req) : { ...req.body };
    if (slugFrom && !payload.slug && payload[slugFrom]) {
      payload.slug = await uniqueSlug(Model, payload[slugFrom]);
    } else if (payload.slug) {
      payload.slug = await uniqueSlug(Model, payload.slug);
    }
    if (Model.schema.path("author") && req.user) payload.author ??= req.user._id;

    const doc = await Model.create(payload);
    res.status(201).json(doc);
  });

  const update = asyncHandler(async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw ApiError.notFound(`${Model.modelName} not found`);

    const payload = transform ? await transform({ ...req.body }, req) : { ...req.body };
    delete payload._id;

    // only re-slug when explicitly asked, so published URLs stay stable
    if (payload.slug && payload.slug !== doc.slug) {
      payload.slug = await uniqueSlug(Model, payload.slug, { ignoreId: doc._id });
    } else {
      delete payload.slug;
    }

    Object.assign(doc, payload);
    await doc.save();
    res.json(doc);
  });

  const trash = asyncHandler(async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw ApiError.notFound(`${Model.modelName} not found`);
    if (doc.isSystem) throw ApiError.forbidden("This item is part of the site structure and cannot be deleted");

    if (softDelete) {
      doc.deletedAt = new Date();
      await doc.save();
      return res.json({ ok: true, trashed: true, id: doc._id });
    }
    await doc.deleteOne();
    res.json({ ok: true, deleted: true, id: doc._id });
  });

  const restore = asyncHandler(async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw ApiError.notFound(`${Model.modelName} not found`);
    doc.deletedAt = null;
    await doc.save();
    res.json({ ok: true, restored: true, id: doc._id });
  });

  const destroy = asyncHandler(async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw ApiError.notFound(`${Model.modelName} not found`);
    if (doc.isSystem) throw ApiError.forbidden("This item is part of the site structure and cannot be deleted");
    await doc.deleteOne();
    res.json({ ok: true, deleted: true, id: doc._id });
  });

  const reorder = asyncHandler(async (req, res) => {
    const { items = [] } = req.body; // [{ id, sortOrder }]
    if (!Array.isArray(items) || !items.length) throw ApiError.badRequest("items[] is required");
    await Model.bulkWrite(
      items.map(({ id, sortOrder }) => ({
        updateOne: { filter: { _id: id }, update: { $set: { sortOrder } } },
      })),
    );
    res.json({ ok: true, updated: items.length });
  });

  return { list, read, create, update, trash, restore, destroy, reorder };
}

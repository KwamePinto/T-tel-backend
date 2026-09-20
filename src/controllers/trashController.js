import { Post, Page, Person, Partner, PartnerGroup, Form, Event, Slider, Document } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { env } from "../config/env.js";

// Every model that supports soft delete, so Trash is a single screen.
const TRASHABLE = {
  post: { Model: Post, label: "Post", titleField: "title" },
  page: { Model: Page, label: "Page", titleField: "title" },
  person: { Model: Person, label: "Person", titleField: "name" },
  partner: { Model: Partner, label: "Partner", titleField: "name" },
  "partner-group": { Model: PartnerGroup, label: "Partner group", titleField: "name" },
  form: { Model: Form, label: "Form", titleField: "title" },
  event: { Model: Event, label: "Event", titleField: "title" },
  slider: { Model: Slider, label: "Slider", titleField: "name" },
  document: { Model: Document, label: "Document", titleField: "title" },
};

export const listTrash = asyncHandler(async (req, res) => {
  const groups = await Promise.all(
    Object.entries(TRASHABLE).map(async ([type, { Model, label, titleField }]) => {
      const docs = await Model.find({ deletedAt: { $ne: null } })
        .sort("-deletedAt")
        .limit(200)
        .populate(Model.schema.path("author") ? "author" : "")
        .lean();
      return docs.map((d) => ({
        id: d._id,
        type,
        typeLabel: label,
        title: d[titleField] || "(untitled)",
        author: d.author?.name || null,
        deletedAt: d.deletedAt,
        autoDeletesAt: new Date(
          new Date(d.deletedAt).getTime() + env.trashRetentionDays * 86400000,
        ),
      }));
    }),
  );

  const items = groups.flat().sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  res.json({ items, total: items.length, retentionDays: env.trashRetentionDays });
});

function resolve(type) {
  const entry = TRASHABLE[type];
  if (!entry) throw ApiError.badRequest(`Unknown item type "${type}"`);
  return entry;
}

export const restoreItem = asyncHandler(async (req, res) => {
  const { Model } = resolve(req.params.type);
  const doc = await Model.findById(req.params.id);
  if (!doc) throw ApiError.notFound("Item not found");
  doc.deletedAt = null;
  await doc.save();
  res.json({ ok: true, id: doc._id });
});

export const destroyItem = asyncHandler(async (req, res) => {
  const { Model } = resolve(req.params.type);
  const doc = await Model.findById(req.params.id);
  if (!doc) throw ApiError.notFound("Item not found");
  await doc.deleteOne();
  res.json({ ok: true, id: doc._id });
});

export const restoreAll = asyncHandler(async (req, res) => {
  let restored = 0;
  for (const { Model } of Object.values(TRASHABLE)) {
    const r = await Model.updateMany({ deletedAt: { $ne: null } }, { $set: { deletedAt: null } });
    restored += r.modifiedCount || 0;
  }
  res.json({ ok: true, restored });
});

export const emptyTrash = asyncHandler(async (req, res) => {
  let deleted = 0;
  for (const { Model } of Object.values(TRASHABLE)) {
    const r = await Model.deleteMany({ deletedAt: { $ne: null } });
    deleted += r.deletedCount || 0;
  }
  res.json({ ok: true, deleted });
});

// Called on boot: permanently remove anything past the retention window.
export async function purgeExpiredTrash() {
  const cutoff = new Date(Date.now() - env.trashRetentionDays * 86400000);
  let purged = 0;
  for (const { Model } of Object.values(TRASHABLE)) {
    const r = await Model.deleteMany({ deletedAt: { $ne: null, $lte: cutoff } });
    purged += r.deletedCount || 0;
  }
  if (purged) console.log(`[trash] purged ${purged} expired item(s)`);
  return purged;
}

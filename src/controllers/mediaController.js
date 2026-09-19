import sharp from "sharp";
import { Media, MediaFolder } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { storage } from "../services/storage.js";
import { escapeRegex } from "../utils/escapeRegex.js";

export const listMedia = asyncHandler(async (req, res) => {
  const { page = 1, limit = 40, search = "", kind = "", folder } = req.query;

  const filter = { deletedAt: null };
  if (folder === "root") filter.folder = null;
  else if (folder) filter.folder = folder;

  if (kind === "image") filter.mime = /^image\//;
  else if (kind === "video") filter.mime = /^video\//;
  else if (kind === "document") filter.mime = { $not: /^(image|video)\// };

  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ originalName: rx }, { alt: rx }];
  }

  const perPage = Math.min(Number(limit) || 40, 100);
  const [items, total] = await Promise.all([
    Media.find(filter).sort("-createdAt").skip((page - 1) * perPage).limit(perPage).lean({ virtuals: true }),
    Media.countDocuments(filter),
  ]);
  res.json({ items, total, page: Number(page), pages: Math.ceil(total / perPage) || 1 });
});

export const uploadMedia = asyncHandler(async (req, res) => {
  const files = req.files?.length ? req.files : req.file ? [req.file] : [];
  if (!files.length) throw ApiError.badRequest("No file was uploaded");

  const store = storage();
  const created = [];

  for (const file of files) {
    const { key, url } = await store.save(file);

    let width, height;
    if (file.mimetype.startsWith("image/") && file.mimetype !== "image/svg+xml") {
      try {
        const meta = await sharp(file.path).metadata();
        width = meta.width;
        height = meta.height;
      } catch {
        /* unreadable image metadata is not fatal */
      }
    }

    created.push(
      await Media.create({
        filename: file.filename,
        originalName: file.originalname,
        key, url,
        mime: file.mimetype,
        size: file.size,
        width, height,
        alt: req.body.alt || "",
        folder: req.body.folder || null,
        uploadedBy: req.user?._id,
      }),
    );
  }

  res.status(201).json({ items: created });
});

export const updateMedia = asyncHandler(async (req, res) => {
  const { alt, caption, folder } = req.body;
  const doc = await Media.findById(req.params.id);
  if (!doc) throw ApiError.notFound("File not found");
  if (alt !== undefined) doc.alt = alt;
  if (caption !== undefined) doc.caption = caption;
  if (folder !== undefined) doc.folder = folder || null;
  await doc.save();
  res.json(doc);
});

export const deleteMedia = asyncHandler(async (req, res) => {
  const doc = await Media.findById(req.params.id);
  if (!doc) throw ApiError.notFound("File not found");
  await storage().remove(doc.key);
  await doc.deleteOne();
  res.json({ ok: true, id: doc._id });
});

export const listFolders = asyncHandler(async (req, res) => {
  const items = await MediaFolder.find().sort("name").lean();
  res.json({ items });
});

export const createFolder = asyncHandler(async (req, res) => {
  const { name, parent = null } = req.body;
  if (!name) throw ApiError.badRequest("Folder name is required");
  const folder = await MediaFolder.create({ name, parent: parent || null });
  res.status(201).json(folder);
});

export const deleteFolder = asyncHandler(async (req, res) => {
  const folder = await MediaFolder.findById(req.params.id);
  if (!folder) throw ApiError.notFound("Folder not found");
  // files are kept, just moved back to the library root
  await Media.updateMany({ folder: folder._id }, { $set: { folder: null } });
  await MediaFolder.updateMany({ parent: folder._id }, { $set: { parent: null } });
  await folder.deleteOne();
  res.json({ ok: true, id: folder._id });
});

/**
 * Downloads each Our People member's photo from the live CMS and attaches
 * it as a Media record, for records that were migrated with a name and bio
 * but no picture.
 *
 * Safe to re-run: a person who already has a photo is left alone.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { connectDb, disconnectDb } from "../config/db.js";
import { env } from "../config/env.js";
import { storage } from "../services/storage.js";
import { toSlug, uniqueSlug } from "../utils/slug.js";
import { Media, Menu, MenuItem, Person, PersonGroup } from "../models/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ARG = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const SOURCE = path.resolve(
  SOURCE_ARG || path.join(HERE, "..", "..", "..", "T-Tel Pixtures", "T-Tel Pixtures"),
);
const DRY = process.argv.includes("--dry");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const GROUP_NAMES = {
  "Board of Directors": "Board of Directors",
  "Finance & Operations": "Finance & Operations",
  "Key Advisors": "Key Advisors",
  SMT: "Senior Management",
  Subscribers: "Subscribers",
  "Technical Pool": "Technical Pool",
};

function normalizeName(value) {
  return String(value || "")
    .replace(/\.[^.]+$/, "")
    .replace(/\s+\(\d+\)$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function imageFiles(folder) {
  return fs.readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name);
}

function safeFileName(name) {
  return `${toSlug(name).slice(0, 80) || "person"}.webp`;
}

async function saveMedia(source, personName, groupSlug) {
  const fileName = safeFileName(personName);
  const key = path.posix.join("images", "people", groupSlug, fileName);
  const absolute = path.join(env.uploadDir, key);
  const buffer = await sharp(source)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 88 })
    .toBuffer();
  const metadata = await sharp(buffer).metadata();

  if (DRY) return { key, width: metadata.width, height: metadata.height, size: buffer.length };

  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, buffer);
  const saved = await storage().save({ path: absolute, mimetype: "image/webp" });
  const sourceUrl = `people://${groupSlug}/${path.basename(source)}`;
  const media = await Media.findOne({ sourceUrl });
  if (media) {
    media.filename = fileName;
    media.originalName = path.basename(source);
    media.key = saved.key;
    media.url = saved.url;
    media.mime = "image/webp";
    media.size = buffer.length;
    media.width = metadata.width;
    media.height = metadata.height;
    media.alt = personName;
    await media.save();
    return media;
  }

  return Media.create({
    filename: fileName,
    originalName: path.basename(source),
    key: saved.key,
    url: saved.url,
    mime: "image/webp",
    size: buffer.length,
    width: metadata.width,
    height: metadata.height,
    alt: personName,
    sourceUrl,
  });
}

async function ensureGroup(name, order) {
  const slug = toSlug(name);
  let group = await PersonGroup.findOne({ slug });
  if (group || DRY) return group || { _id: null, name, slug, sortOrder: order };
  group = await PersonGroup.create({ name, slug, sortOrder: order, description: "" });
  console.log(`  created group: ${name}`);
  return group;
}

async function ensurePeopleMenuItem(group, order) {
  const menu = await Menu.findOne({ slug: "main" });
  if (!menu || DRY) return;
  const parent = await MenuItem.findOne({ menu: menu._id, label: "Our People" });
  if (!parent) return;
  const url = `/about-us/our-people/${group.slug}`;
  const exists = await MenuItem.exists({ menu: menu._id, url });
  if (!exists) {
    await MenuItem.create({ menu: menu._id, parent: parent._id, label: group.name, url, sortOrder: order });
    console.log(`  added menu item: ${group.name}`);
  }
}

async function main() {
  if (!fs.existsSync(SOURCE)) throw new Error(`Picture folder not found: ${SOURCE}`);
  await connectDb();

  const existingGroups = await PersonGroup.find().sort("sortOrder name").lean();
  const groupOrder = new Map(existingGroups.map((group, index) => [group.slug, group.sortOrder ?? index]));
  const folders = fs.readdirSync(SOURCE, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const stats = { createdGroups: 0, createdPeople: 0, updatedPeople: 0, images: 0, duplicates: 0 };

  for (const [folderIndex, folder] of folders.entries()) {
    const groupName = GROUP_NAMES[folder.name] || folder.name;
    const groupSlug = toSlug(groupName);
    const group = await ensureGroup(groupName, groupOrder.get(groupSlug) ?? existingGroups.length + folderIndex);
    const people = await Person.find({ group: group._id, deletedAt: null }).sort("sortOrder name").lean();
    const byName = new Map(people.map((person) => [normalizeName(person.name), person]));
    const imported = new Set();
    const importedIds = new Set();
    const files = imageFiles(path.join(SOURCE, folder.name));

    console.log(`${folder.name}: ${files.length} image(s) -> ${groupName}`);
    await ensurePeopleMenuItem(group, groupOrder.get(groupSlug) ?? existingGroups.length + folderIndex);

    for (const [index, file] of files.entries()) {
      const source = path.join(SOURCE, folder.name, file);
      const fileName = path.basename(file, path.extname(file));
      const nameKey = normalizeName(fileName);
      let person = byName.get(nameKey);

      if (imported.has(nameKey)) {
        stats.duplicates++;
        console.log(`  duplicate name, image refreshed: ${fileName}`);
        continue;
      }
      imported.add(nameKey);
      const media = await saveMedia(source, fileName, groupSlug);

      if (person) {
        stats.updatedPeople++;
        console.log(`  update ${person.name} <- ${file}`);
        if (!DRY) {
          await Person.updateOne(
            { _id: person._id },
            { $set: { photo: media._id, sortOrder: index } },
          );
        }
        importedIds.add(String(person._id));
      } else {
        stats.createdPeople++;
        console.log(`  create ${fileName}`);
        if (!DRY) {
          person = await Person.create({
            name: fileName,
            slug: await uniqueSlug(Person, fileName),
            group: group._id,
            photo: media._id,
            bio: "",
            position: "",
            sortOrder: index,
            status: "published",
          });
          byName.set(nameKey, person);
          importedIds.add(String(person._id));
        }
      }
      stats.images++;
    }

    if (!DRY) {
      const remaining = await Person.find({
        group: group._id,
        deletedAt: null,
        _id: { $nin: [...importedIds] },
      }).sort("sortOrder name").lean();
      await Promise.all(
        remaining.map((person, index) =>
          Person.updateOne({ _id: person._id }, { $set: { sortOrder: files.length + index } }),
        ),
      );
    }
  }

  console.log(`\n${DRY ? "[dry run] " : ""}groups created: ${stats.createdGroups}`);
  console.log(`people created: ${stats.createdPeople}, updated: ${stats.updatedPeople}`);
  console.log(`images processed: ${stats.images}, duplicate filenames: ${stats.duplicates}`);
  await disconnectDb();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectDb();
  process.exit(1);
});

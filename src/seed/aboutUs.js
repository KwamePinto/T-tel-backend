/**
 * Writes just the Who We Are page sections.
 *
 *   node src/seed/aboutUs.js
 *
 * Split out of the full seed for the same reason as ourHistory.js — the whole
 * migration takes minutes against Atlas.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Page } from "../models/index.js";
import { ABOUT_US_SECTIONS } from "./defaults.js";

await connectDb();

const page = await Page.findOne({ slug: "about-us" });
if (!page) {
  console.error("about-us page not found");
  await disconnectDb();
  process.exit(1);
}

const managed = new Set(ABOUT_US_SECTIONS.map((s) => s.type));
const others = (page.sections || []).filter((s) => !managed.has(s.type));
page.sections = [...ABOUT_US_SECTIONS, ...others];
await page.save();

console.log(`about-us: sections now ${page.sections.map((s) => s.type).join(", ")}`);

await disconnectDb();

/**
 * Writes just the Our History milestones section.
 *
 *   node src/seed/ourHistory.js
 *
 * Split out of the full seed so the page can be reworked without waiting on
 * the whole content migration.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Page } from "../models/index.js";
import { OUR_HISTORY_MILESTONES } from "./defaults.js";

await connectDb();

const page = await Page.findOne({ slug: "about-us/our-history" });
if (!page) {
  console.error("our-history page not found");
  await disconnectDb();
  process.exit(1);
}

// replace any previous layout section, keep anything else the page carries
const others = (page.sections || []).filter(
  (s) => s.type !== "timeline" && s.type !== "milestones",
);
page.sections = [OUR_HISTORY_MILESTONES, ...others];
await page.save();

console.log(
  `our-history: ${OUR_HISTORY_MILESTONES.data.milestones.length} milestones written ` +
  `(sections now: ${page.sections.map((s) => s.type).join(", ")})`,
);

await disconnectDb();

/**
 * Sorts every existing page into the special/custom split.
 *
 * Special pages are the ones with a coded component and a route in App.jsx —
 * their content is structured, their slug is bound to that route, and each has
 * a blueprint in the admin describing the fields its component actually reads.
 * Everything else is a custom page: hero plus rich text, rendered by the
 * catch-all route.
 *
 * Safe to run more than once. Run it again whenever a developer adds a new
 * special page, with its slug added to the list below.
 *
 *   node scripts/classifyPages.js
 */
import { connectDb, disconnectDb } from "../src/config/db.js";
import { Page } from "../src/models/Page.js";

/** Slugs that have a component of their own. Keep in step with the admin's
 *  pageBlueprints folder — a slug here with no blueprint gets a "no editor
 *  defined" notice in the admin rather than a broken screen. */
const SPECIAL_SLUGS = [
  "home",
  "about-us",
  "about-us/our-history",
  "about-us/our-partners",
  "about-us/our-people",
  "about-us/our-policies",
  "focus-areas",
  "programmes",
  "knowledge-hub",
  "news-and-media",
  "join-us",
  "contact-us",
];

async function main() {
  await connectDb();

  const pages = await Page.find({}, "slug title kind isSystem").lean();
  let special = 0;
  let custom = 0;

  for (const page of pages) {
    const isSpecial = SPECIAL_SLUGS.includes(page.slug);
    const kind = isSpecial ? "special" : "custom";
    // a special page's slug is wired to a route, so it must not be trashable;
    // custom pages stay deletable by whoever made them
    const isSystem = isSpecial;

    if (page.kind === kind && page.isSystem === isSystem) {
      isSpecial ? special++ : custom++;
      continue;
    }

    await Page.updateOne({ _id: page._id }, { $set: { kind, isSystem } });
    console.log(`  ${kind.padEnd(7)} ${page.slug}`);
    isSpecial ? special++ : custom++;
  }

  const missing = SPECIAL_SLUGS.filter((s) => !pages.some((p) => p.slug === s));
  if (missing.length) {
    console.log(`\n  no page record yet for: ${missing.join(", ")}`);
  }

  console.log(`\ndone — ${special} special, ${custom} custom`);
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});

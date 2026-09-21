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
import { connectDb, disconnectDb } from "../config/db.js";
import { Page } from "../models/Page.js";

/** The main menus a page can be filed under. */
const MENUS = ["about-us", "focus-areas", "programmes"];

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

  const pages = await Page.find({}, "slug title kind isSystem section").lean();
  let special = 0;
  let custom = 0;

  for (const page of pages) {
    const isSpecial = SPECIAL_SLUGS.includes(page.slug);
    const kind = isSpecial ? "special" : "custom";
    // which menu the page sits under, read from its own address — the menu
    // landing pages themselves ("about-us") count as being in their section
    const section =
      MENUS.find((m) => page.slug === m || page.slug.startsWith(`${m}/`)) || "";
    // a special page's slug is wired to a route, so it must not be trashable;
    // custom pages stay deletable by whoever made them
    const isSystem = isSpecial;

    if (page.kind === kind && page.isSystem === isSystem && page.section === section) {
      isSpecial ? special++ : custom++;
      continue;
    }

    await Page.updateOne({ _id: page._id }, { $set: { kind, isSystem, section } });
    console.log(`  ${kind.padEnd(7)} ${(section || "—").padEnd(12)} ${page.slug}`);
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

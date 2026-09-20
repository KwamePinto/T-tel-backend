/**
 * Copies the hero text that was hard-coded in the listing pages' components
 * into their page records.
 *
 * Those components now read their hero from the database (see CmsHero), with
 * the old hard-coded values kept as the fallback — so the site looks the same
 * either way. Seeding is what makes the admin *show* the words that are
 * actually on the page, instead of empty boxes whose effect only appears once
 * something is typed into them.
 *
 * Focus Areas and News & Media are deliberately left blank: their headings
 * come from Theme settings, and filling these in would override that.
 *
 * Safe to run more than once — it never overwrites a value already set.
 *
 *   node scripts/seedPageHeroes.js
 */
import { connectDb, disconnectDb } from "../src/config/db.js";
import { Page } from "../src/models/Page.js";

const HEROES = {
  "knowledge-hub": {
    heroTitle: "Knowledge Hub",
    heroDescription:
      "Research, teaching resources, evaluation reports and publications from a decade of education reform in Ghana.",
  },
  "contact-us": {
    heroTitle: "Contact Us",
    heroDescription:
      "Have questions or enquiries? Reach us using the details below or complete the enquiry form.",
  },
  "join-us": {
    heroTitle: "Join Our Team",
    heroDescription:
      "Build your career with a Ghanaian organisation transforming teaching, education and learning.",
  },
  programmes: {
    heroTitle: "Programmes",
    heroDescription:
      "The projects through which T-TEL delivers technical advice, project management, research and implementation support across Ghana.",
  },
  "about-us/our-policies": { heroTitle: "Our Policies" },
  "about-us/our-people": { heroTitle: "Our People" },
};

async function main() {
  await connectDb();

  for (const [slug, hero] of Object.entries(HEROES)) {
    const page = await Page.findOne({ slug });
    if (!page) {
      console.log(`  skipped ${slug} — no page record`);
      continue;
    }

    const patch = {};
    for (const [key, value] of Object.entries(hero)) {
      if (!page.meta?.[key]) patch[`meta.${key}`] = value;
    }

    if (!Object.keys(patch).length) {
      console.log(`  unchanged ${slug}`);
      continue;
    }

    await Page.updateOne({ _id: page._id }, { $set: patch });
    console.log(`  seeded ${slug} — ${Object.keys(patch).join(", ")}`);
  }

  console.log("\ndone");
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});

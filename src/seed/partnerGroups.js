/**
 * Creates the three Our Partners groups (Government, Universities, Funding &
 * Project Partners) as PartnerGroup records, so partners can be filed under
 * them from the admin instead of the group list being hardcoded.
 *
 * Safe to re-run: each group upserts by slug.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Page } from "../models/Page.js";
import { PartnerGroup } from "../models/PartnerGroup.js";

const GROUPS = [
  { slug: "government", name: "Government Partners", sortOrder: 0 },
  { slug: "university", name: "Universities", sortOrder: 1 },
  { slug: "funder", name: "Funding & Project Partners", sortOrder: 2 },
];

await connectDb();

for (const group of GROUPS) {
  await PartnerGroup.updateOne(
    { slug: group.slug },
    { $set: group, $setOnInsert: { description: "" } },
    { upsert: true },
  );
}

const page = await Page.findOne({ slug: "about-us/our-partners" });
if (page) {
  const sections = page.sections || [];
  const intro = sections.find((section) => section.type === "partnerIntro") || {
    type: "partnerIntro", enabled: true, data: {},
  };
  intro.data = {
    eyebrow: intro.data?.eyebrow || "Working Together",
    body: intro.data?.body || "T-TEL works with a wide range of government, university, funding and implementation partners across Ghana, bringing together specialist expertise to strengthen teaching, education and learning.",
  };

  const partnerGroups = sections.find((section) => section.type === "partnerGroups") || {
    type: "partnerGroups", enabled: true, data: {},
  };
  partnerGroups.data = {
    items: GROUPS.map(({ slug, name }) => ({ key: slug, title: name })),
  };

  page.sections = [
    intro,
    partnerGroups,
    ...sections.filter((section) => !["partnerIntro", "partnerGroups"].includes(section.type)),
  ];
  page.markModified("sections");
  await page.save();
}

console.log("partner groups and Our Partners sections seeded");
await disconnectDb();

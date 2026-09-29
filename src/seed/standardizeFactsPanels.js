/**
 * Standardizes every Programmes post's facts-panel (Details panel) HTML to
 * the same "one fact per paragraph" shape "t-shel" (Secondary Education
 * Reform) already used — <p><strong>Label</strong> value</p>, with a note
 * like a source line getting its own separate <p> — instead of the
 * <ul><li> shape four other posts had drifted to.
 *
 * The distinction matters because ProgrammeDetail.module.css's rendering is
 * built entirely around <p> children of .details: each one gets its own
 * bottom border and the bold label becomes a small green caption above its
 * value. A <ul><li> list never triggers any of that — it renders as a plain
 * arrow-bulleted list instead, which is why only t-shel (and, by luck, none
 * of the others) had the bordered look the client asked to standardize on.
 *
 * transforming-tvet-pilot has no facts section at all and is left alone —
 * nothing to convert.
 *
 *   node src/seed/standardizeFactsPanels.js [--dry]
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Post } from "../models/index.js";

const DRY = process.argv.includes("--dry");

const ASIDES = {
  gdcp:
    "<p><strong>Project Amount</strong> CHF 1,974,642</p>" +
    "<p>(source: Jacobs Foundation)</p>" +
    "<p><strong>Project Duration</strong> Feb 2022 to July 2023</p>" +
    "<p><strong>Partners</strong> Jacobs Foundation, Government of Ghana</p>",

  "supported-teaching-in-school":
    "<p><strong>Project Amount</strong> $400,000</p>" +
    "<p>(source: Gates Foundation)</p>" +
    "<p><strong>Project Duration</strong> September 2023 to December 2025</p>" +
    "<p><strong>Partners</strong> Gates Foundation, University of Cape Coast, Directorate of Research, Innovation and Consultancy (UCC-DRIC), Education Sub-Saharan Africa (ESSA)</p>",

  "teaching-innovation-lab":
    "<p><strong>Project Amount</strong> $147,283.67</p>" +
    "<p>(source: Elimu-Soko)</p>" +
    "<p><strong>Project Duration</strong> September 2026 to July 2027</p>" +
    "<p><strong>Partners</strong> Elimu-Soko, Ghana Education Service, Ghana EdTech Alliance, Playlab AI, Ghana NLP</p>",

  "ghana-foundational-learning-reform-phase-1":
    "<p><strong>Project Duration</strong> 1 June 2026 to 31 August 2027</p>" +
    "<p><strong>Partners</strong> Ministry of Education, Ghana Education Service, Prevail Foundry Inc, Learning Masterminds, Inspiring Teachers, Rising Academies</p>" +
    "<p><strong>Funding Source</strong> Prevail Foundry Inc</p>",
};

await connectDb();

for (const [slug, aside] of Object.entries(ASIDES)) {
  const post = await Post.findOne({ slug });
  if (!post) { console.log(`! not found: ${slug}`); continue; }
  if (!post.sections?.[0]) { console.log(`! ${slug} has no sections[0], skipping`); continue; }

  console.log(`\n${slug}`);
  console.log(`  before: ${post.sections[0].aside}`);
  console.log(`  after:  ${aside}`);

  if (!DRY) {
    post.sections[0].aside = aside;
    post.markModified("sections");
    await post.save();
    console.log("  saved");
  }
}

await disconnectDb();

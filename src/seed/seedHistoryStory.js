/**
 * Fills in the opening account on Our History — the half that sits above the
 * roadmap, with the pinned heading on the left and the text on the right.
 *
 * Only writes fields that are still empty, so anything edited in the admin
 * afterwards survives a re-run.
 *
 *   node scripts/seedHistoryStory.js
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Page } from "../models/Page.js";

const STORY = {
  eyebrow: "Institutional Origins",
  heading: "The Journey So Far",
  subheading: "A lifetime of creating impact together.",
  lead:
    "Transforming Teaching, Education & Learning (T-TEL) was established as an independent Ghanaian not-for-profit organisation on 7th July 2020.",
  paras: [
    "T-TEL was established after the successful completion of Transforming Teacher Education and Learning, a six-year $34 million Government of Ghana pre-service teacher training programme funded by the Foreign, Commonwealth & Development Office (FCDO) and implemented by Cambridge Education from 2014 to 2020.",
    "Transforming Teacher Education & Learning was a national teacher education reform programme owned by the Ministry of Education and led by the Ghana Tertiary Education Commission (GTEC). Its work centred on the introduction of a Bachelor in Education (B.Ed.) degree in Initial Teacher Education in all 46 public Colleges of Education (CoEs) affiliated to 5 public universities. Transforming Teacher Education and Learning was seen by key stakeholders including FCDO and the Ministry of Education as a very successful programme which brought about significant changes in Ghana's teacher education system.",
  ],
  quote:
    "Feedback for T-TEL's work has been consistently positive through this review process and the programme represents a very strong example of how technical assistance can support national scale reforms and implementation across the education system.",
  quoteAttrib: "The programme's December 2019 annual review by FCDO",
  stats: [
    { value: "$34m", label: "Programme value" },
    { value: "2014–2020", label: "Founding programme" },
  ],
};

const TIMELINE = {
  timelineEyebrow: "The Roadmap",
  timelineHeading: "How T-TEL took shape, phase by phase.",
};

async function main() {
  await connectDb();

  const page = await Page.findOne({ slug: "about-us/our-history" });
  if (!page) throw new Error("no Our History page record");

  const section = page.sections.find((s) => s.type === "milestones");
  if (!section) throw new Error("no milestones section on Our History");

  const data = section.data || {};
  const changed = [];

  if (!data.story || !Object.keys(data.story).length) {
    data.story = STORY;
    changed.push("story");
  }
  for (const [key, value] of Object.entries(TIMELINE)) {
    if (!data[key]) { data[key] = value; changed.push(key); }
  }

  if (!changed.length) {
    console.log("unchanged — everything already set");
  } else {
    section.data = data;
    page.markModified("sections");
    await page.save();
    console.log("seeded: " + changed.join(", "));
  }

  const saved = await Page.findOne({ slug: "about-us/our-history" }).lean();
  const d = saved.sections.find((s) => s.type === "milestones").data;
  console.log(`story paras=${d.story?.paras?.length} quote=${d.story?.quote ? "yes" : "no"}`);
  console.log(`phases=${d.milestones?.length} links=${d.links?.length}`);

  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});

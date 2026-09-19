/**
 * Rewrites Our History to match the reference site exactly.
 *
 *   node src/seed/historyPhases.js [--dry]
 *
 * Five phases, the reference site's own wording, laid out as the snaking
 * bracket it uses: each entry spans the full width with a rule down one side
 * and along the bottom, alternating, and a numbered badge centred on the
 * ruled edge.
 *
 * Two departures from the source, both deliberate:
 *
 *   Phase 2 has no number on the reference site — its badge renders empty.
 *   That is a defect rather than a design, so it is numbered here.
 *
 *   The two closing links point at the old t-tel.org site. Keeping the site
 *   self-contained was an earlier instruction on this page specifically, so
 *   they point at the equivalent pages here.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Page } from "../models/Page.js";

const DRY = process.argv.includes("--dry");

const HERO = "https://t-tel-live.citservices.net/storage/media/hero-files/t8V1DNSLp2O63Hl2j6MPomuAMF9tPyerkc7G7qEe.jpg";
const PHASE_IMAGE = "https://t-tel-live.citservices.net/storage/media/hero-files/v4YSPHN5R7UomnnXcZdxK04BGWQ4cYQZYcLu6Y2U.png";

const PHASES = [
  {
    step: 1,
    title: "Phase 1",
    image: PHASE_IMAGE,
    paras: [
      "The establishment of Transforming Teaching, Education and Learning (T-TEL) as a not-for-profit organisation was an important moment in Ghana's education reform journey. What began as an externally funded and managed development programme evolved into a fully Ghanaian-owned organisation committed to supporting national efforts to improve education at all levels.",
    ],
  },
  {
    step: 2,
    // The reference site repeats Phase 1's photograph here; showing the same
    // picture twice in one column says nothing the second time.
    title: "Phase 2",
    image: null,
    paras: [
      "The idea to set up T-TEL as an independent organisation was first conceived on 30 July 2019 during a meeting held on the margins of the Association for the Development of Education in Africa High-Level Policy Dialogue Forum on Secondary Education in Johannesburg, South Africa. The meeting brought together representatives from the Mastercard Foundation and a high-level Ghanaian delegation led by the then Minister for Education. Accompanying the Minister were the Director-General of the Ghana Education Service, the Administrator of GETFund and a Key Advisor from the T-TEL Project1 who had played a central role in facilitating the delegation's participation.",
    ],
  },
  {
    step: 3,
    title: "Phase 3",
    image: null,
    paras: [
      "Recognising the imminent closure of the T-TEL Project in December 2020, the Minister and his team saw the urgent need to sustain the momentum and technical support that the Project had provided. They agreed that the legacy of the T-TEL Project should continue through the creation of a new, independent and Ghanaian-led organisation.",
    ],
  },
  {
    step: 4,
    title: "Phase 4",
    image: null,
    paras: [
      "Upon returning to Ghana, a small team of committed individuals was mobilized who became known as the promoters. These individuals gave their time, expertise and energy to ensure that proper foundations were laid for the new organisation. Their efforts led to the identification of a distinguished legal expert, the recruitment of founding subscribers and board members and ultimately, the registration of Transforming Teaching, Education and Learning (T-TEL) as a Ghanaian non-governmental organisation on 7th July 2020.",
    ],
  },
  {
    step: 5,
    title: "Phase 5",
    image: null,
    paras: [
      "From its inception T-TEL was built on the principle of partnership with government and education institutions. It was created to serve as a trusted technical partner, supporting national leadership to own reforms and drive innovations to move Ghana's education system to greater heights.",
    ],
  },
];

const LINKS = [
  {
    label: "Read more about the FCDO funded Transforming Teacher Education and Learning Programme",
    url: "/about-us/who-we-are",
  },
  { label: "Download T-TEL Project Report", url: "/knowledge-hub/reports-and-publications" },
];

await connectDb();

const page = await Page.findOne({ slug: /our-history/ });
if (!page) throw new Error("Our History page not found — run the main seed first.");

const section = (page.sections || []).find((s) => s.type === "milestones");
if (!section) throw new Error("Our History has no milestones section to rewrite.");

const data = {
  layout: "phases",
  heroSource: HERO,
  // the reference page opens straight onto the timeline
  intro: [],
  milestones: PHASES,
  links: LINKS,
};

console.log(`${PHASES.length} phases`);
PHASES.forEach((p) => console.log(
  `  ${p.step}. ${p.title.padEnd(8)} ${p.image ? "image" : "     "}  ` +
  `${p.paras.reduce((n, x) => n + x.length, 0)}c`));
console.log(`${LINKS.length} closing links`);

if (DRY) {
  console.log("\n[dry run] nothing written");
} else {
  section.data = data;
  page.markModified("sections");
  await page.save();
  console.log("\nsaved");
}

await disconnectDb();

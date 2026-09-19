/**
 * Rewrites Our History as a phased timeline.
 *
 *   node src/seed/historyTimeline.js [--dry]
 *
 * Fuses the two accounts that existed separately. This database held dated
 * milestones — 2014 through 2021, each with a photograph — while the reference
 * site told the story as five unillustrated phases, with detail the milestones
 * did not carry: where the idea was first raised, who carried it, the date of
 * registration.
 *
 * Neither is complete on its own. The phases skip 2014 and 2018 entirely; the
 * milestones are a sentence each. So the entries below run chronologically,
 * keep the photographs, and carry both a `summary` (shown at rest) and the
 * full `body` (revealed when an entry is opened).
 *
 * Existing milestone images are reused by year, so nothing new is downloaded.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Page } from "../models/Page.js";

const DRY = process.argv.includes("--dry");

/** The fused account. `image` is filled in from what the page already holds. */
const PHASES = [
  {
    year: "2014",
    title: "The programme begins",
    summary: "A six-year Government of Ghana teacher training programme, funded by the FCDO.",
    body: [
      "Transforming Teacher Education & Learning was established as a Government of Ghana pre-service teacher training programme, funded by the Foreign, Commonwealth & Development Office (FCDO) and implemented by Cambridge Education.",
      "It was a national teacher education reform programme owned by the Ministry of Education and delivered across the country's Colleges of Education.",
    ],
  },
  {
    year: "2018",
    title: "A wider remit",
    summary: "The work broadens from teacher training into teacher education policy reform.",
    body: [
      "T-TEL's remit extended to focus on comprehensive teacher education policy reform, led by the Ghana Tertiary Education Commission (GTEC).",
    ],
  },
  {
    year: "2019",
    title: "The idea is first raised",
    summary: "On the margins of a policy forum in Johannesburg, a Ghanaian delegation asks what happens when the programme ends.",
    body: [
      "The idea to set up T-TEL as an independent organisation was first conceived on 30 July 2019, during a meeting held on the margins of the Association for the Development of Education in Africa High-Level Policy Dialogue Forum on Secondary Education in Johannesburg, South Africa.",
      "The meeting brought together representatives from the Mastercard Foundation and a high-level Ghanaian delegation led by the then Minister for Education. Accompanying the Minister were the Director-General of the Ghana Education Service, the Administrator of GETFund and a Key Advisor from the T-TEL Project who had played a central role in facilitating the delegation's participation.",
      "In parallel, the programme team was exploring options with the Ministry of Education to keep the work going once the FCDO programme ended.",
    ],
  },
  {
    year: "2020",
    title: "T-TEL is established",
    summary: "Registered as a Ghanaian not-for-profit on 7th July, carried there by a small group of promoters.",
    body: [
      "Recognising the imminent closure of the T-TEL Project in December 2020, the Minister and his team saw the urgent need to sustain the momentum and technical support the Project had provided. They agreed that its legacy should continue through the creation of a new, independent and Ghanaian-led organisation.",
      "Upon returning to Ghana, a small team of committed individuals was mobilised who became known as the promoters. They gave their time, expertise and energy to ensure proper foundations were laid: the identification of a distinguished legal expert, the recruitment of founding subscribers and board members, and ultimately the registration of Transforming Teaching, Education and Learning (T-TEL) as a Ghanaian non-governmental organisation on 7th July 2020.",
      "T-TEL was established to provide high quality technical advice, project management, research and implementation support services, using local talent and expertise to enable Ghana's education system to reach greater heights.",
    ],
  },
  {
    year: "2021",
    title: "Fully operational",
    summary: "Operations begin in February, and the first three projects start together.",
    body: [
      "T-TEL became fully operational in February 2021 and commenced its first three projects: T-SHEL in partnership with the Mastercard Foundation, DeliverEd in partnership with the University of Oxford, and the COVID-19 Impact Assessment Study in partnership with EdTech Hub.",
    ],
  },
  {
    year: "Today",
    title: "A Ghanaian organisation, and a partner",
    summary: "What began as an externally funded programme is now Ghanaian-owned, working alongside government rather than for it.",
    body: [
      "The establishment of T-TEL as a not-for-profit organisation was an important moment in Ghana's education reform journey. What began as an externally funded and managed development programme evolved into a fully Ghanaian-owned organisation, committed to supporting national efforts to improve education at all levels.",
      "From its inception T-TEL was built on the principle of partnership with government and education institutions. It was created to serve as a trusted technical partner, supporting national leadership to own reforms and drive innovations that move Ghana's education system to greater heights.",
    ],
  },
];

await connectDb();

const page = await Page.findOne({ slug: /our-history/ });
if (!page) throw new Error("Our History page not found — run the main seed first.");

const section = (page.sections || []).find((s) => s.type === "milestones");
if (!section) throw new Error("Our History has no milestones section to rewrite.");

// carry the photographs across by the year they were filed under
const byYear = new Map((section.data?.milestones || []).map((m) => [String(m.year), m.image]));

// The closing phase is not a dated event, so it has no milestone photograph of
// its own. The staff group portrait already in the front end says what it is
// about — an organisation rather than a programme — better than a stock image.
if (!byYear.get("Today")) byYear.set("Today", "/images/photos/team-group.jpg");

const phases = PHASES.map((phase, i) => ({
  step: i + 1,
  year: phase.year,
  title: phase.title,
  summary: phase.summary,
  body: phase.body,
  image: byYear.get(phase.year) || null,
}));

const missing = phases.filter((p) => !p.image).map((p) => p.year);

console.log(`${phases.length} phases`);
phases.forEach((p) => console.log(
  `  ${String(p.step)}. ${String(p.year).padEnd(6)} ${p.title.padEnd(38)} ` +
  `${p.body.reduce((n, b) => n + b.length, 0)}c  ${p.image ? "image" : "no image"}`));
if (missing.length) console.log(`  (no photograph on file for: ${missing.join(", ")})`);

if (!DRY) {
  section.data = { ...section.data, milestones: phases };
  page.markModified("sections");
  await page.save();
  console.log("\nsaved");
} else {
  console.log("\n[dry run] nothing written");
}

await disconnectDb();

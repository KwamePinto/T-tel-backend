/**
 * Rewrites Our History to match the reference site exactly.
 *
 *   node src/seed/historyPhases.js [--dry]
 *
 * Five phases in the reference site's own wording, plus the account that runs
 * beside them. The page reads as one column of numbered entries with a pinned
 * heading and a single photograph — Phase 1's — held in the rail alongside, so
 * only phase 1 carries an image here. Phases 2–5 are text only.
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
const PHASE_IMAGE = "/images/history/2014-programme-launch.jpg";

const PHASES = [
  {
    step: 1,
    title: "The programme begins",
    image: PHASE_IMAGE,
    paras: [
      "The establishment of Transforming Teaching, Education and Learning (T-TEL) as a not-for-profit organisation was an important moment in Ghana's education reform journey. What began as an externally funded and managed development programme evolved into a fully Ghanaian-owned organisation committed to supporting national efforts to improve education at all levels.",
    ],
  },
  {
    step: 2,
    // One photograph for the whole sequence: Phase 1's picture is lifted out
    // to the rail beside the phases, so repeating it here would show the same
    // image twice on one screen. Phases 2–5 are text only.
    title: "The idea is born",
    paras: [
      "The idea to set up T-TEL as an independent organisation was first conceived on 30 July 2019 during a meeting held on the margins of the Association for the Development of Education in Africa High-Level Policy Dialogue Forum on Secondary Education in Johannesburg, South Africa. The meeting brought together representatives from the Mastercard Foundation and a high-level Ghanaian delegation led by the then Minister for Education. Accompanying the Minister were the Director-General of the Ghana Education Service, the Administrator of GETFund and a Key Advisor from the T-TEL Project1 who had played a central role in facilitating the delegation's participation.",
    ],
  },
  {
    step: 3,
    title: "Momentum protected",
    paras: [
      "Recognising the imminent closure of the T-TEL Project in December 2020, the Minister and his team saw the urgent need to sustain the momentum and technical support that the Project had provided. They agreed that the legacy of the T-TEL Project should continue through the creation of a new, independent and Ghanaian-led organisation.",
    ],
  },
  {
    step: 4,
    title: "Foundations laid",
    paras: [
      "Upon returning to Ghana, a small team of committed individuals was mobilized who became known as the promoters. These individuals gave their time, expertise and energy to ensure that proper foundations were laid for the new organisation. Their efforts led to the identification of a distinguished legal expert, the recruitment of founding subscribers and board members and ultimately, the registration of Transforming Teaching, Education and Learning (T-TEL) as a Ghanaian non-governmental organisation on 7th July 2020.",
    ],
  },
  {
    step: 5,
    title: "Built on partnership",
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

/**
 * The account that runs beside the pinned heading.
 *
 * This is the page's earlier long-form copy, carried over verbatim when the
 * roadmap was re-cut: the opening three paragraphs came from the intro that
 * used to sit above the timeline, the closing four from the text that followed
 * its quote. It lives in `story.paras` so the opening account reads as a full
 * piece again rather than an empty column under its heading.
 */
const ACCOUNT = [
  "Transforming Teaching, Education & Learning (T-TEL) was established as an independent Ghanaian not-for-profit organisation on 7th July 2020.",
  "T-TEL was established after the successful completion of Transforming Teacher Education and Learning, a six-year $34 million Government of Ghana pre-service teacher training programme funded by the Foreign, Commonwealth & Development Office (FCDO) and implemented by Cambridge Education from 2014 to 2020.",
  "Transforming Teacher Education & Learning was a national teacher education reform programme owned by the Ministry of Education and led by the Ghana Tertiary Education Commission (GTEC). Its work centred on the introduction of a Bachelor in Education (B.Ed.) degree in Initial Teacher Education in all 46 public Colleges of Education (CoEs) affiliated to 5 public universities. It was seen by key stakeholders including FCDO and the Ministry of Education as a very successful programme which brought about significant changes in Ghana's teacher education system.",
  "The Independent Commission on Aid Impact (ICAI)'s country report on UK aid to Ghana, published in February 2020, found that T-TEL's work on teacher training was the UK Government funded intervention in Ghana judged 'most likely to be sustained' due to its strong performance on institutional strengthening and \"strong signals that practice in Colleges of Education has changed.\"",
  "With this credible platform established the programme team, with the guidance of the then Minister of Education, Dr. Mathew Opoku Prempeh, and key educationists, explored options to keep this work going after the FCDO programme ended. Through discussions with the Ministry of Education and international donor agencies the organisation's founders identified the need for a competent, highly skilled Ghanaian Technical Assistance provider to assist the education system to articulate and achieve its policy goals. It was agreed that T-TEL was positioned to fill this gap within the Ghanaian education sector.",
  "The Mastercard Foundation agreed to explore the potential for future partnership and with this encouragement a group of 15 subscribers came together to develop T-TEL's constitution, vision, mission and guiding principles. These subscribers all have a strong commitment to improving the quality and relevance of learning outcomes across Ghana's education system. Their commitment and dedication ensured that T-TEL was formally registered in July 2020.",
  "Currently most large-scale TA programmes in Ghana involve international organisations who, whilst most of their employees may be Ghanaian, have leadership structures and processes based outside of the country. The aspiration to provide genuinely Ghanaian competition for these international organisations, using contextual expertise, understanding and rootedness to provide high quality services which deliver results and represent value for money is the driving force behind T-TEL.",
];

await connectDb();

const page = await Page.findOne({ slug: /our-history/ });
if (!page) throw new Error("Our History page not found — run the main seed first.");

const section = (page.sections || []).find((s) => s.type === "milestones");
if (!section) throw new Error("Our History has no milestones section to rewrite.");

const data = {
  layout: "phases",
  heroSource: HERO,
  story: {
    eyebrow: "Our Origins",
    heading: "From an externally funded programme to a Ghanaian-owned institution",
    lead: "The idea is conceived on the margins of an ADEA policy forum in Johannesburg.",
    paras: ACCOUNT,
    stats: [
      { value: "2019", label: "The idea is conceived on the margins of an ADEA policy forum in Johannesburg." },
      { value: "7 July 2020", label: "Registered as a Ghanaian non-governmental organisation." },
      { value: "2020", label: "The T-TEL Project's legacy continues under national leadership." },
    ],
    quote: "Created to serve as a trusted technical partner — supporting national leadership to own reforms and drive innovations to move Ghana's education system to greater heights.",
    quoteAttrib: "The founding purpose of T-TEL",
  },
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

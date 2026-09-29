/**
 * Reworks the Our Programmes menu to the client's requested structure and
 * order:
 *   1. Secondary Education Reform (Leaders in Teaching)  — unchanged (t-shel)
 *   2. Ghana Foundational Learning Reform Phase 1        — renamed from
 *      "Gates Foundation"; body/sections/excerpt left exactly as they were,
 *      per the client's explicit instruction ("everything remains the same")
 *   3. Teaching Innovation Lab                            — new, from docx
 *   4. Supported Teaching in School (STS) Research         — new, from docx
 *   5. Transforming TVET Pilot                             — unchanged
 *   6. Ghana District Change Project: Communities of Excellence — unchanged
 *
 *   node src/seed/reworkProgrammesMenu.js [--dry]
 *
 * Content for the two new posts was extracted directly from the client's
 * .docx files (bold runs -> facts panel / <h3> headings, numbered
 * paragraphs -> <ul>), matching the exact aside/facts-panel HTML shape
 * already used by the existing "Ghana District Change Project" post
 * (a <ul><li><strong>Label</strong><br>value</li>...</ul>), so the new
 * pages render identically in style to what's already there.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Post, ContentType, Menu, MenuItem } from "../models/index.js";
import { syncPostNavPlacement } from "../services/navPlacement.js";

const DRY = process.argv.includes("--dry");

const STS_ASIDE =
  "<ul><li><strong>Project Amount</strong><br>$400,000<br>(source: Gates Foundation)</li>" +
  "<li><strong>Project Duration</strong><br>September 2023 to December 2025</li>" +
  "<li><strong>Partners</strong><br>Gates Foundation, University of Cape Coast, Directorate of Research, Innovation and Consultancy (UCC-DRIC), Education Sub-Saharan Africa (ESSA)</li></ul>";

const STS_HTML = `<p>The Supported Teaching in School (STS) Research Project was implemented by T-TEL in partnership with the University of Cape Coast, Directorate of Research, Innovation and Consultancy (UCC-DRIC) and Education Sub-Saharan Africa (ESSA), with funding from the Gates Foundation. The study examined how the practical school-based component of Ghana's Bachelor of Education (B.Ed.) programme prepared student teachers to teach foundational literacy and numeracy effectively.</p>
<p>Supported Teaching in School is a core part of the four-year B.Ed. programme delivered across Ghana's public Colleges of Education. It gives student teachers opportunities to observe experienced teachers, work with mentors, plan and teach lessons and gradually take greater responsibility for learners. STS accounts for 30% of the overall B.Ed. assessment.</p>
<p>The research was designed to strengthen the national evidence base on STS, particularly how it influenced student teachers' classroom practice, their ability to teach foundational literacy and numeracy and their understanding and application of the National Teachers' Standards.</p>
<h3>What did the research examine?</h3>
<p>The study focused on Year 3 and Year 4 student teachers undertaking the KG to Primary 3 specialism. It examined how STS influenced their ability to teach foundational literacy and numeracy, how mentorship shaped their development and how their knowledge, confidence and professional readiness changed through the STS experience.</p>
<p>The research combined surveys, classroom observations and interviews with student teachers, mentors, tutors and other stakeholders. Data collection covered 30 Colleges of Education and their partner schools, providing a broad national evidence base on the implementation and effects of STS.</p>
<h3>What did the research find?</h3>
<p>The study found that STS contributed to improvements in student teachers' confidence, professional readiness and classroom practice, particularly where they received structured mentorship, regular feedback and strong supervision.</p>
<p>It also identified areas requiring further attention. Student teachers generally demonstrated stronger practice in foundational numeracy than literacy, with persistent gaps in phonics, differentiation, formative assessment and opportunities for learners to ask questions, explain their thinking and work collaboratively.</p>
<p>The research also confirmed the importance of mentorship. Student teachers who worked with mentors who understood the National Teachers' Standards and provided regular, practical feedback showed stronger progress than those who received limited or inconsistent support.</p>
<h3>Using the evidence to strengthen teacher education</h3>
<p>The findings have contributed to national discussions on teacher education reform and have informed recommendations to strengthen practical foundational literacy and numeracy within the B.Ed., improve mentor preparation and supervision and strengthen collaboration between Colleges of Education, partner schools and District Education Offices.</p>
<p>The study has provided Ghana with a stronger national evidence base on what is working within STS, where implementation needs to improve and how future teachers can be better prepared to meet the National Teachers' Standards and teach foundational literacy and numeracy effectively.</p>`;

const TIL_ASIDE =
  "<ul><li><strong>Project Amount</strong><br>$147,283.67<br>(source: Elimu-Soko)</li>" +
  "<li><strong>Project Duration</strong><br>September 2026 to July 2027</li>" +
  "<li><strong>Partners</strong><br>Elimu-Soko, Ghana Education Service, Ghana EdTech Alliance, Playlab AI, Ghana NLP</li></ul>";

const TIL_HTML = `<p>The Teaching Innovation Lab pilot is a Ghana Education Service initiative being implemented with support from T-TEL and Elimu-Soko to test a harmonised approach to weekly Professional Learning Communities (PLCs) in basic schools.</p>
<p>GES introduced weekly school-based PLC sessions in 2019 alongside the standards-based curriculum for Kindergarten to Primary 6. A baseline study conducted in August 2025 found that more than 80% of teachers regularly attended PLC sessions, but many sessions lacked structured materials and clear facilitation guidance. As a result, sessions were often dominated by lectures and general discussion, with limited opportunities for teachers to practise and receive feedback on specific teaching approaches.</p>
<p>T-TEL is supporting GES to strengthen this existing system through a harmonised PLC Facilitation Guide and an AI-enabled Digital PLC Assistant. The Facilitation Guide helps curriculum leads and headteachers organise PLC sessions around active practice, modelling, discussion and focused presentation, drawing on approved materials from GES, NaCCA, T-TEL and other education partners.</p>
<p>The Digital PLC Assistant, developed by the Ghana EdTech Alliance, Playlab AI and Ghana NLP under the guidance of GES, provides teachers, curriculum leads and headteachers with practical support on lesson planning, classroom activities, assessment and responding to different learner needs. It is designed to provide guidance in multiple Ghanaian languages and to work in low-connectivity settings.</p>
<h3>How will the pilot work?</h3>
<p>The approach is being tested over one academic year in 90 public basic schools across six districts: Yendi, Ga West, Assin Fosu, Jaman South, Shama and Adaklu Waya, reaching approximately 2,125 teachers and 48,771 learners.</p>
<p>The schools have been assigned to three groups:</p>
<ul><li>30 schools using the PLC Facilitation Guide only</li><li>30 schools using the Guide and Digital PLC Assistant</li><li>30 schools using the Guide and Digital PLC Assistant, with additional face-to-face facilitator training</li></ul>
<p>The pilot will help GES understand whether the Digital PLC Assistant adds value beyond the Facilitation Guide and whether face-to-face facilitator training provides additional benefits.</p>
<h3>Strengthening foundational literacy and numeracy</h3>
<p>The pilot focuses on improving classroom practice in foundational literacy and numeracy. PLC sessions will give teachers opportunities to learn and practise specific teaching approaches, apply them in their classrooms and reflect on learner responses with colleagues.</p>
<h3>GES ownership and national learning</h3>
<p>The pilot is being implemented through existing GES structures, with District Education Offices and School Improvement Support Officers providing oversight and support. A GES-chaired Pilot Oversight Committee will review implementation progress, while T-TEL will provide coordination, monitoring and technical support.</p>
<p>An independent evaluation will assess changes in classroom practice and learner outcomes. The evidence generated will help GES decide how a strengthened approach to PLCs can be expanded nationally in a way that is practical, affordable and sustainable.</p>`;

// Final desired order of the Programmes menu's MenuItem rows.
const ORDER = [
  "t-shel",
  "ghana-foundational-learning-reform-phase-1",
  "teaching-innovation-lab",
  "supported-teaching-in-school",
  "transforming-tvet-pilot",
  "gdcp",
];

await connectDb();

const ct = await ContentType.findOne({ slug: "programmes" });
const mainMenu = await Menu.findOne({ slug: "main" });
const programmesTab = await MenuItem.findOne({ menu: mainMenu._id, parent: null, url: "/programmes" });

console.log(`${DRY ? "[dry] " : ""}--- 1. rename Gates Foundation -> Ghana Foundational Learning Reform Phase 1 ---`);
const gatesPost = await Post.findOne({ slug: "gates-foundation" });
if (!gatesPost) throw new Error("gates-foundation post not found");
console.log(`  title: "${gatesPost.title}" -> "Ghana Foundational Learning Reform Phase 1"`);
console.log(`  slug: "${gatesPost.slug}" -> "ghana-foundational-learning-reform-phase-1"`);
console.log("  body/sections/excerpt/featuredImage: left untouched");
if (!DRY) {
  gatesPost.title = "Ghana Foundational Learning Reform Phase 1";
  gatesPost.slug = "ghana-foundational-learning-reform-phase-1";
  await gatesPost.save();
  await syncPostNavPlacement(gatesPost);
}

console.log(`\n${DRY ? "[dry] " : ""}--- 2. create Supported Teaching in School (STS) Research ---`);
if (!DRY) {
  const existing = await Post.findOne({ slug: "supported-teaching-in-school" });
  if (existing) {
    console.log("  already exists, skipping create");
  } else {
    const sts = await Post.create({
      contentType: ct._id,
      title: "Supported Teaching in School (STS) Research",
      slug: "supported-teaching-in-school",
      excerpt: "A two-year study with the University of Cape Coast and Education Sub-Saharan Africa, funded by the Gates Foundation, into how Ghana's B.Ed. practicum prepares student teachers to teach foundational literacy and numeracy.",
      body: STS_HTML,
      sections: [{ type: "facts", html: STS_HTML, aside: STS_ASIDE, image: null, flip: false }],
      status: "published",
      publishedAt: new Date(),
      navPlacement: { parentUrl: "/programmes", label: "" },
    });
    await syncPostNavPlacement(sts);
    console.log("  created:", sts.slug);
  }
} else {
  console.log("  [dry] would create supported-teaching-in-school");
}

console.log(`\n${DRY ? "[dry] " : ""}--- 3. create Teaching Innovation Lab ---`);
if (!DRY) {
  const existing = await Post.findOne({ slug: "teaching-innovation-lab" });
  if (existing) {
    console.log("  already exists, skipping create");
  } else {
    const til = await Post.create({
      contentType: ct._id,
      title: "Teaching Innovation Lab",
      slug: "teaching-innovation-lab",
      excerpt: "A Ghana Education Service pilot, supported by T-TEL and Elimu-Soko, testing a harmonised PLC Facilitation Guide and an AI-enabled Digital PLC Assistant across 90 basic schools.",
      body: TIL_HTML,
      sections: [{ type: "facts", html: TIL_HTML, aside: TIL_ASIDE, image: null, flip: false }],
      status: "published",
      publishedAt: new Date(),
      navPlacement: { parentUrl: "/programmes", label: "" },
    });
    await syncPostNavPlacement(til);
    console.log("  created:", til.slug);
  }
} else {
  console.log("  [dry] would create teaching-innovation-lab");
}

console.log(`\n${DRY ? "[dry] " : ""}--- 4. reorder Programmes menu items ---`);
if (!DRY) {
  for (let i = 0; i < ORDER.length; i++) {
    const slug = ORDER[i];
    const post = await Post.findOne({ slug });
    if (!post) { console.log(`  ! post not found for slug "${slug}", skipping`); continue; }
    const item = await MenuItem.findOne({ linkType: "post", linkRef: post._id, parent: programmesTab._id });
    if (!item) { console.log(`  ! no menu item linked to "${slug}" yet, skipping`); continue; }
    item.sortOrder = i;
    await item.save();
    console.log(`  [${i}] ${slug} -> "${item.label}"`);
  }
} else {
  ORDER.forEach((slug, i) => console.log(`  [dry] [${i}] ${slug}`));
}

console.log("\nDone.");
await disconnectDb();

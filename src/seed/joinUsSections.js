/**
 * Writes the Join Us page's structured sections (intro, roles, CTA), the
 * same content the page used to render from a hardcoded frontend module.
 *
 * Re-running overwrites these sections with the copy below — check the
 * admin for edits worth preserving before running this again.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Page } from "../models/Page.js";

const sections = [
  {
    type: "joinIntro",
    enabled: true,
    data: {
      eyebrow: "Careers",
      title: "Build the",
      accent: "Future",
      lead: "Join a nationally-led team dedicated to bridging the gap between high-level policy and classroom reality.",
    },
  },
  {
    type: "joinValues",
    enabled: true,
    data: {
      items: [
        { n: "01", accent: "green", title: "Ghanaian-led", body: "We use local talent and expertise to build institutions that last — careers here grow Ghana's own capability." },
        { n: "02", accent: "blue", title: "Classroom Focused", body: "Our work bridges the gap between high-level policy and what actually happens in a classroom." },
        { n: "03", accent: "gold", title: "Room to Grow", body: "From regional advisory roles to national programme leadership, our people move and develop across the organisation." },
      ],
    },
  },
  {
    type: "joinRoles",
    enabled: true,
    data: {
      groups: [
        { group: "Technical Pool", roles: ["Regional Education Advisor", "Delivery Coordinator — Leadership", "Delivery Coordinator — Teacher CPD", "Delivery Coordinator — Inclusion"] },
        { group: "Finance & Operations", roles: ["Senior Operations Officer", "Finance Officer", "MERL Officer", "IT & Systems Officer"] },
      ],
    },
  },
  {
    type: "joinSafeguarding",
    enabled: true,
    data: {
      title: "Our Commitment",
      body: "T-TEL is committed to safeguarding children and vulnerable adults. All appointments are subject to background checks and to our Child & Youth Safeguarding Policy, and every member of staff is trained on their responsibilities.",
    },
  },
  {
    type: "joinCta",
    enabled: true,
    data: {
      spec: "Don't see a matching role? Send a speculative application — we're always looking for good people.",
    },
  },
];

await connectDb();
const page = await Page.findOne({ slug: "join-us" });
if (!page) throw new Error("join-us page not found");
const existing = page.sections || [];
page.sections = [
  ...sections.map((section) => existing.find((item) => item.type === section.type) || section),
  ...existing.filter((item) => !sections.some((section) => section.type === item.type)),
];
page.markModified("sections");
await page.save();
console.log("Join Us sections seeded");
await disconnectDb();

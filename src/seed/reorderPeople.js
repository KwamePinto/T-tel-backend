/**
 * Puts the Our People categories into a fixed editorial order.
 *
 *   node src/seed/reorderPeople.js --dry   show what would change
 *   node src/seed/reorderPeople.js         write it
 *
 * Both the public pages and the dashboard list people by `sortOrder` (name as
 * the tie-break), so writing the field in one place is enough to move the
 * cards on the site and the rows in the admin table at the same time.
 *
 * Each category is given an explicit running order. Names below the listed
 * ones keep the order they are already in and simply continue the sequence,
 * so nobody is dropped and the list stays dense. Categories with no entry in
 * ORDER are not touched at all.
 *
 * Re-running is safe: the order is derived from these names, not from the
 * numbers currently stored, so the result is always the same.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Person, PersonGroup } from "../models/index.js";

const DRY = process.argv.includes("--dry");
const STEP = 10;

/**
 * The running order, per group slug. Names are compared loosely — titles,
 * punctuation and case are ignored — so "Dr. Michael Boakye-Yiadom" below
 * still finds the record stored as "Professor Michael Boakye-Yiadom".
 */
const ORDER = {
  subscribers: [
    "Professor Jophus Anamuah-Mensah",
    "Sister Elizabeth Amoako-Arhen",
    "Professor Rita Akosua Dickson",
    "Tony Dogbe",
    "Professor Kwame Akyeampong",
    "Dinah Adiko",
    "Samuel Baba Adongo",
    "John Martin",
    "Alhaji Mohammed Haroon",
    "Perpertual Wadjoly",
    "Professor Wisdom Akpalu",
    "Felicia Boakye-Yiadom",
    "Muniratu Issifu",
  ],
  "board-of-directors": [
    "Professor Jophus Anamuah-Mensah",
    "Sister Elizabeth Amoako-Arhen",
    "Robin Todd",
    "Professor Rita Akosua Dickson",
    "John Martin",
    "Professor Kwame Akyeampong",
    "Aso Wusu Asante",
    "Professor Mohammed Salifu",
    "Dr. Michael Boakye-Yiadom",
    "Priscilla Anima Akyeampong",
    "Janice Edzie",
  ],
  "key-advisors": [
    "Professor Jophus Anamuah-Mensah",
    "Professor Eric Ananga",
    "Akwasi Addae-Boahene",
    "Professor Jonathan Fletcher",
    "Professor Eric Anane",
    "Dr. Sam Awuku",
    "Bea Noble-Rogers",
    "Dinah Adiko",
    "Yvette Iyadede",
    "Aaron Kwaku Twum Akwaboah",
    "Patty Assan",
    "Peter Antwi Boasiako",
    "Ahuma Cabutey Adodoadji",
    "Betty Djokoto",
  ],
  "senior-management": [
    "Robin Todd",
    "Noshie Iddisah",
    "Roger Aikins",
    "Beryl Opong-Agyei",
    "Ernest Wesley-Otoo",
    "Patricia Adu-Twum",
    "Emefa Horsoo",
    "Kingsley Ofosu",
    "Abdul-Karim Kadiri",
  ],
};

/** Honorifics carry no identity, and the stored record may disagree with the list. */
const TITLES = new Set([
  "prof", "professor", "dr", "doctor", "mr", "mrs", "miss", "ms",
  "sister", "brother", "rev", "reverend", "alhaji", "hajia", "hon",
]);

function norm(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !TITLES.has(w))
    .join(" ");
}

/** Fallback for a record that spells a name differently but shares every word. */
const words = (name) => new Set(norm(name).split(" ").filter(Boolean));

await connectDb();

const groups = await PersonGroup.find().lean();
let written = 0;
const problems = [];

for (const [slug, wanted] of Object.entries(ORDER)) {
  const group = groups.find((g) => g.slug === slug);
  if (!group) {
    problems.push(`group "${slug}" does not exist`);
    continue;
  }

  const people = await Person.find({ group: group._id, deletedAt: null })
    .sort("sortOrder name")
    .lean();

  const byNorm = new Map();
  for (const p of people) {
    const key = norm(p.name);
    if (byNorm.has(key)) problems.push(`"${slug}" has two records matching "${key}"`);
    else byNorm.set(key, p);
  }

  const ordered = [];
  const used = new Set();

  for (const name of wanted) {
    let match = byNorm.get(norm(name));

    if (!match) {
      // every word of the wanted name must appear in the record's name
      const target = words(name);
      const loose = people.filter((p) => {
        if (used.has(p._id.toString())) return false;
        const have = words(p.name);
        return [...target].every((w) => have.has(w));
      });
      if (loose.length === 1) match = loose[0];
      else if (loose.length > 1) {
        problems.push(`"${name}" in "${slug}" matches ${loose.length} records — left in place`);
        continue;
      }
    }

    if (!match) {
      problems.push(`"${name}" is listed under "${slug}" but no such person exists`);
      continue;
    }
    if (used.has(match._id.toString())) continue; // listed twice in the brief

    used.add(match._id.toString());
    ordered.push(match);
  }

  // everyone the brief did not name keeps their current order, after the rest
  const rest = people.filter((p) => !used.has(p._id.toString()));
  const final = [...ordered, ...rest];

  console.log(`\n${group.name} — ${final.length} people`);
  for (const [i, p] of final.entries()) {
    const next = (i + 1) * STEP;
    const mark = used.has(p._id.toString()) ? " " : "·";
    const changed = p.sortOrder === next ? "" : `  (was ${p.sortOrder})`;
    console.log(`  ${mark} ${String(next).padStart(3)}  ${p.name}${changed}`);
  }

  if (!DRY) {
    for (const [i, p] of final.entries()) {
      const next = (i + 1) * STEP;
      if (p.sortOrder === next) continue;
      await Person.updateOne({ _id: p._id }, { $set: { sortOrder: next } });
      written += 1;
    }
  }
}

console.log("");
for (const p of problems) console.log(`  ! ${p}`);

await disconnectDb();
console.log(
  DRY
    ? `\n[dry run] ${problems.length} problem(s), nothing written`
    : `\n${written} record(s) reordered, ${problems.length} problem(s)`,
);

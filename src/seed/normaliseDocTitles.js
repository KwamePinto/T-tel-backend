/**
 * Normalises Knowledge Hub document titles.
 *
 *   node src/seed/normaliseDocTitles.js [--dry] [--limit N]
 *
 * Titles come from filenames, so they arrive in whatever shape the person
 * saving the file chose: ALL CAPS, "B ed", "Y2 S1", "(J.H.S)", stray leading
 * numbers. This brings them to one house style while leaving the vocabulary
 * alone — it never invents or translates words, and every title stays editable
 * in the dashboard.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Document } from "../models/index.js";

const DRY = process.argv.includes("--dry");
const LIMIT = Number(process.argv[process.argv.indexOf("--limit") + 1]) || 0;

/** Terms that keep their exact casing wherever they appear. */
const ACRONYMS = [
  "B.Ed.", "JHS", "SHS", "KG", "TVET", "ICT", "STS", "EGE", "SEN", "GESI",
  "T-TEL", "FCDO", "GTEC", "PLC", "TPD", "PD", "PDC", "CoE", "CoEs", "NTS",
  "NTECF", "MoE", "GES", "NaCCA", "CPD", "SBI", "INSET", "II", "III", "IV",
];
const ACRONYM_LOOKUP = new Map(ACRONYMS.map((a) => [a.toLowerCase().replace(/\./g, ""), a]));

/** Words that stay lowercase inside a title. */
const MINOR = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "of",
  "on", "or", "the", "to", "with", "via",
]);

/** Short words that are English, not acronyms — so ALL CAPS means shouting. */
const COMMON_WORDS = new Set([
  ...MINOR,
  "one", "two", "main", "new", "old", "all", "its", "our", "your", "not", "are",
  "is", "be", "you", "we", "it", "he", "she", "they", "this", "that", "part",
  "unit", "book", "term", "year", "plan", "use", "how", "why", "who", "what",
  "end", "top", "key", "aid", "set", "map", "law", "art", "job", "day", "way",
]);

function titleCaseWord(word, isFirst) {
  const bare = word.replace(/[^\w-]/g, "").toLowerCase();

  const acronym = ACRONYM_LOOKUP.get(bare.replace(/\./g, ""));
  if (acronym) return word.replace(/[\w.-]+/, acronym);

  if (!isFirst && MINOR.has(bare)) return word.toLowerCase();

  // leave deliberate internal capitals (McGraw, eLearning) alone
  if (/[a-z][A-Z]/.test(word)) return word;

  return word.replace(/^(\W*)(\w)(.*)$/, (_, pre, first, rest) => pre + first.toUpperCase() + rest.toLowerCase());
}

function normalise(raw) {
  let t = ` ${raw} `;

  // --- abbreviations and course shorthand ---
  t = t.replace(/\bB[\s.]*ed\b\.?/gi, "B.Ed.");
  t = t.replace(/\(\s*J\.?\s*H\.?\s*S\.?\s*\)/gi, "(JHS)");
  t = t.replace(/\(\s*S\.?\s*H\.?\s*S\.?\s*\)/gi, "(SHS)");
  t = t.replace(/\(\s*U\.?\s*P\.?\s*\)/gi, "(Upper Primary)");
  t = t.replace(/\(\s*upper\s+primary\s*\)/gi, "(Upper Primary)");
  t = t.replace(/\bY(\d)\s*S(\d)\b/gi, "Year $1 Semester $2");
  t = t.replace(/\bsem(?:ester)?\s*(\d)\b/gi, "Semester $1");
  t = t.replace(/\byear\s*(\d)\b/gi, "Year $1");
  t = t.replace(/\bKG\s*(\d)\s*[-–]?\s*(\d)\b/gi, "KG $1–$2");

  // --- stray leading tokens the filename carried ---
  t = t.replace(/^\s*\d+\s+(?=[A-Za-z])/, " ");        // "1 year 4, ..."
  t = t.replace(/\s*,\s*(?=Semester)/gi, " ");          // "Year 4, Semester 2"

  t = t.replace(/\s{2,}/g, " ").trim();

  // --- casing ---
  // An all-caps word is either an acronym to keep or shouting to fix. It counts
  // as an acronym when it is on the known list, or is short and isn't an
  // ordinary English word — so CEP, EG and PDC survive while IN, FOR, ONE and
  // MAIN get fixed alongside FRENCH and MATHEMATICS. Deciding per word, not per
  // title, keeps a series like "Y2 S1 FRENCH PDC" and "Y2 S1 LANGUAGE AND
  // LITERACY PDC" styled the same way.
  t = t.split(" ").map((word, i) => {
    const bare = word.replace(/[^\w]/g, "");
    const letters = bare.replace(/[^A-Za-z]/g, "");
    const acronym = ACRONYM_LOOKUP.get(bare.toLowerCase().replace(/\./g, ""));
    if (acronym) return word.replace(/[\w.-]+/, acronym);

    const isCaps = letters.length > 1 && letters === letters.toUpperCase();
    if (isCaps) {
      const looksLikeAcronym = letters.length <= 4 && !COMMON_WORDS.has(letters.toLowerCase());
      if (!looksLikeAcronym) return titleCaseWord(word, i === 0);
      return word;
    }

    if (i === 0) return word.replace(/^(\w)/, (c) => c.toUpperCase());
    return word;
  }).join(" ");

  t = t.replace(/\s+([,.;:)])/g, "$1").replace(/\(\s+/g, "(");
  return t.replace(/\s{2,}/g, " ").trim();
}

await connectDb();

const docs = await Document.find({ deletedAt: null }).select("title").lean();
let changed = 0;
const samples = [];

for (const d of docs) {
  const next = normalise(d.title);
  if (next === d.title) continue;
  changed++;
  if (samples.length < 20) samples.push(`${d.title}\n        -> ${next}`);
  if (!DRY) await Document.updateOne({ _id: d._id }, { $set: { title: next } });
  if (LIMIT && changed >= LIMIT) break;
}

console.log(`${DRY ? "[dry] " : ""}${changed} of ${docs.length} title(s) normalised`);
samples.forEach((s) => console.log("   " + s));

await disconnectDb();

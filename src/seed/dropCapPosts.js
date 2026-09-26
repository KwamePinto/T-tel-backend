/**
 * Wraps the first letter of every post's rendered content in
 * <span class="dropcap">…</span>, matching the new Drop cap button in the
 * dashboard's rich text editor.
 *
 * A post's rendered content is its `body`, unless it has `sections` (Focus
 * Areas and Programmes lay out that way instead) — in that case the first
 * section with any text is what a visitor actually sees first, so that's
 * where the drop cap goes.
 *
 *   node src/seed/dropCapPosts.js [--dry]
 *
 * Safe to re-run: a field that already starts with a dropcap span, or whose
 * first character isn't a letter, is left untouched.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Post } from "../models/index.js";

const DRY = process.argv.includes("--dry");

// Leading tags/whitespace, then the first letter — e.g. "<p>Hello" matches
// "<p>" as the prefix and "H" as the letter.
const FIRST_LETTER = /^((?:\s|<[^>]+>)*)([A-Za-z])/;

function applyDropCap(html) {
  if (!html || html.includes('class="dropcap"')) return null;
  const match = html.match(FIRST_LETTER);
  if (!match) return null;
  const [whole, prefix, letter] = match;
  return `${prefix}<span class="dropcap">${letter}</span>` + html.slice(whole.length);
}

await connectDb();

const posts = await Post.find({ deletedAt: null });
let changed = 0;
let skipped = 0;

for (const post of posts) {
  let field = null;
  let next = applyDropCap(post.body);
  if (next) {
    field = "body";
  } else if (post.sections?.length) {
    const target = post.sections.find((sec) => applyDropCap(sec.html));
    if (target) {
      next = applyDropCap(target.html);
      target.html = next;
      field = `sections[${post.sections.indexOf(target)}].html`;
    }
  }

  if (field === "body") post.body = next;

  if (!field) {
    skipped += 1;
    continue;
  }

  changed += 1;
  console.log(`${DRY ? "[dry] " : ""}${post.title} — ${field}`);
  if (!DRY) await post.save();
}

console.log(`\n${changed} post(s) updated, ${skipped} skipped (already done or no usable text).`);

await disconnectDb();

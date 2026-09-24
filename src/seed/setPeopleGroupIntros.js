/**
 * Writes the intro paragraph shown above the photo grid on the Subscribers
 * and Board of Directors pages (PersonGroup.intro — see src/models/Person.js).
 *
 *   node src/seed/setPeopleGroupIntros.js --dry
 *   node src/seed/setPeopleGroupIntros.js
 *
 * Only these two groups get one; every other category is left exactly as
 * it is, since it never had this field written and the frontend simply
 * shows nothing when it's blank.
 *
 * Re-running overwrites the two groups listed below with the text here —
 * check the admin for an edit worth keeping before running this again.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { PersonGroup } from "../models/index.js";

const DRY = process.argv.includes("--dry");

const INTROS = {
  subscribers:
    "<p>T-TEL has 13 Subscribers who are the legal custodians of the organisation and ensure the adherence " +
    "to its Objects, Vision, Mission and Values. Their diverse skills, experiences and perspectives in the " +
    "field of education represent the breadth of Ghanaian society which T-TEL seeks to serve. They are " +
    "responsible for appointing the Board.</p>",
  "board-of-directors":
    "<p>The Board of Directors is the key decision-making body of T-TEL organisation and ensures the " +
    "implementation of decisions and resolutions made at the annual general meeting. The Board provides " +
    "strategic direction to, and oversight of the Executive Team of T-TEL (the Secretariat) and has a clear " +
    "remit to focus on the operations of T-TEL as an organisation. It acts as the bridge between the " +
    "Subscribers and the Secretariat and meets on a quarterly basis. There are currently eight full Board " +
    "members – six members (including the Chair) are from the Subscribers whilst two additional members " +
    "have been nominated by the Ministry of Education. Board meetings are also attended by the Executive " +
    "Director, a Ministry of Education representative and the Company Secretary whom do not have voting " +
    "rights.</p>",
};

async function main() {
  await connectDb();

  for (const [slug, intro] of Object.entries(INTROS)) {
    const group = await PersonGroup.findOne({ slug });
    if (!group) {
      console.log(`  ! no PersonGroup with slug "${slug}" — skipped`);
      continue;
    }
    console.log(`  ${group.name}: ${intro.replace(/<[^>]+>/g, "").length} chars${DRY ? " (dry run)" : ""}`);
    if (!DRY) await PersonGroup.updateOne({ _id: group._id }, { $set: { intro } });
  }

  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});

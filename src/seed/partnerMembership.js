/**
 * Moves partners onto the multi-group `groups` list.
 *
 *   node src/seed/partnerMembership.js [--dry]
 *
 * A partner used to belong to exactly one group, held in `group`. Partners can
 * now belong to several, held in `groups`, with `group` kept only as a mirror
 * of the first entry for anything still reading it.
 *
 * This backfills the list from the single field for records written before the
 * change. It is idempotent and additive: a partner that already has a list is
 * left alone, so it is safe to re-run and never undoes work done in the admin.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Partner } from "../models/Partner.js";

const DRY = process.argv.includes("--dry");

await connectDb();

const stale = await Partner.find({
  deletedAt: null,
  $or: [{ groups: { $exists: false } }, { groups: { $size: 0 } }],
  group: { $nin: [null, ""] },
}).select("name group groups").lean();

console.log(`${stale.length} partner(s) still on the single group field`);

for (const partner of stale) {
  console.log(`  ${partner.name.padEnd(45)} ${partner.group} -> [${partner.group}]`);
  if (!DRY) {
    await Partner.updateOne(
      { _id: partner._id },
      { $set: { groups: [partner.group], group: partner.group } },
    );
  }
}

const remaining = await Partner.countDocuments({
  deletedAt: null,
  $or: [{ groups: { $exists: false } }, { groups: { $size: 0 } }],
});

console.log(DRY ? "\n[dry run] nothing written" : `\nsaved; ${remaining} partner(s) still without a group`);
await disconnectDb();

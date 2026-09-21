# Seed & content scripts

Everything in this folder talks to MongoDB directly (via `connectDb()`) to
set up or adjust content — as opposed to `handover/`, one level up, which
moves an entire database or bucket from one place to another. Run any of
these with `node src/seed/<file>.js` from `ttel-backend/`, after `.env` is
filled in.

Most take a `--dry` flag that prints what would change without writing
anything — check a script's own header comment before running it for real.

## Bootstrap

Run once, when the database is first created.

| Script | What it does |
|---|---|
| `run.js` | The original migration: seeds content types, menus, settings and pages, and — the first time only — imports the content that used to be hardcoded in the React frontend's `src/data/` files. **Already run against production.** Re-running is safe (everything upserts by slug) but pointless once the frontend it reads from no longer has a `src/data` folder, which it doesn't any more. |
| `defaults.js` | Not a script — the structural data (`CONTENT_TYPES`, `PAGES`, menu trees, …) that `run.js` and several one-time scripts below import from. |

**On a cloned database (a new deployment via `handover/clone-database.mjs`):
don't run `run.js` again.** The clone already carries everything this would
create; running it again is redundant, not harmful, but has no effect other
than a slower deploy.

## Reusable maintenance

Safe to run again whenever the underlying situation changes — each is
idempotent and documents in its own header exactly what it touches.

| Script | What it does |
|---|---|
| `reorderPeople.js` | Applies a fixed editorial order to each Our People category. Edit the `ORDER` object at the top to change the order or add a category. |
| `reorderKnowledgeHubCollections.js` | Same idea, for the order the Knowledge Hub's collections and their PDFs appear in. |
| `tagSecondaryGroups.js` | Files every Secondary Education document into one of its four display groups, by pattern-matching the original uploaded filename. Re-run after adding new Secondary Education PDFs so they get tagged too. |
| `syncMediaSizes.js` | Re-reads every Media file from disk/bucket and corrects its stored byte size, in case it drifted from what's on record. |
| `verifyStorage.js` | Checks that the configured R2 bucket actually holds every file the database expects — run after a storage migration or if images start 404ing. |
| `migrateToR2.js` | Uploads everything under the local `uploads/` folder to the bucket configured in this app's own `.env`. This is *local disk → this app's bucket*; for *one bucket → a different bucket*, use `handover/migrate-r2-bucket.mjs` instead. |
| `optimiseMedia.js` | Re-encodes stored images to shrink page weight. Safe to re-run; it skips anything already optimised. |

## One-time content fixes

Each of these solved a specific, already-fixed problem in the data at some
point during development — a batch of titles with the wrong encoding, a
page's content that needed rewriting to match a reference, filenames that
needed shortening for Windows' path-length limit, and so on. **They have
already run against the production database.** They're kept here as a
record of what was done and because deleting working, documented code for
no reason isn't a cleanup — but there should be no need to run any of them
again unless the exact problem they describe recurs (for example, ingesting
a fresh batch of PDFs with the same stray-character issue `cleanDocTitles.js`
was written for).

Read the header comment of the specific script before running one of these —
each explains precisely what it changes and why.

`aboutUs.js` · `addContactPhoneField.js` · `addTvetCollection.js` ·
`classifyPages.js` · `cleanDocTitles.js` · `ensureCtaSettings.js` ·
`fixEncodedTitles.js` · `historyPhases.js` · `historyTimeline.js` ·
`importFocusContent.js` · `importFocusLayout.js` · `importLive.js` ·
`importPartners.js` · `importPeoplePictures.js` · `ingestDocs.js` ·
`ingestPolicies.js` · `joinUsSections.js` · `normaliseDocTitles.js` ·
`ourHistory.js` · `partnerGroups.js` · `partnerMembership.js` ·
`rebuildKnowledgeHubNav.js` · `rebuildProgrammesNav.js` ·
`relativiseMediaUrls.js` · `repairMediaKeys.js` · `resetDocs.js` ·
`seedFocusKeyInfo.js` · `seedFrench.js` · `seedHistoryStory.js` ·
`seedPageHeroes.js` · `shortenUploadNames.js` · `trimPartnerLogos.js`

## Adding a new one-off script

Give it the same shape as its neighbours: a header comment stating exactly
what it does, how to run it (including a `--dry` mode if it writes
anything), and whether it's safe to re-run. Drop it in this folder — put it
in the "reusable maintenance" table above if the client's IT team might
reasonably need to run it themselves later, or leave it undocumented in the
list otherwise.

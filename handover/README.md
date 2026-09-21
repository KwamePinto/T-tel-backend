# Handing over to the client's infrastructure

This folder holds the two scripts that move the live site from the
developer's Cloudflare R2 bucket and MongoDB Atlas cluster onto the
client's own. Nothing here is part of the running application — it exists
to be run once (maybe twice — see [Refreshing before go-live](#refreshing-the-clone-right-before-go-live)),
by whoever is handling the handover, and then set aside.

| Script | Copies | Script | Copies |
|---|---|---|---|
| `clone-database.mjs` | Every collection, document and index in MongoDB | `migrate-r2-bucket.mjs` | Every file in the R2 bucket (PDFs, images, thumbnails) |

Both are read-only against the source — the developer's database and bucket
are never modified or deleted by running these.

## Before you start

You will need, side by side:

- **The developer's MongoDB Atlas connection string** and the client's own
  (a new Atlas project, on the client's account or one created for them).
- **The developer's Cloudflare R2 API credentials** for the bucket the site
  currently uses, and a **new R2 bucket created in the client's own
  Cloudflare account** with its own API token.
- Node.js installed (whatever version this project's main `README.md`
  specifies), and `npm install` already run in `ttel-backend/` — these
  scripts use packages (`mongodb`, `@aws-sdk/*`) already listed in that
  `package.json`.

None of this needs to be done by the developer personally. Everything above
is ordinary account-creation work the client's IT team can do themselves;
the developer only needs to hand over their own two sets of read credentials
(Atlas connection string, R2 API token) for the duration of the transfer,
and can revoke or rotate both immediately afterwards.

## When to run this

Run it **after** the client's Atlas cluster and R2 bucket exist, but
**before** the client's backend deployment goes live and starts receiving
real traffic. Content created in the CMS after the clone will not
automatically appear on the client's side — see
[Refreshing the clone](#refreshing-the-clone-right-before-go-live) below for
how to handle that.

## Step by step

### 1. Configure

```bash
cd ttel-backend
cp handover/.env.example handover/.env
```

Fill in `handover/.env` with both sets of credentials. Full explanation of
every value, including exactly where to find each one in the Cloudflare
dashboard, is in the comments of `handover/.env.example` itself.

This file holds two live credential pairs at once — treat it the same way
you would treat the application's own `.env`. It is already covered by
`.gitignore` (the repo's `.env*` rule matches it at any depth), so it will
never be committed.

### 2. Dry run both scripts first

```bash
node handover/clone-database.mjs --dry
node handover/migrate-r2-bucket.mjs --dry
```

Each prints exactly what it would do — every collection and how many
documents, every object and how many bytes — without writing anything. Read
the output. If a collection or object count looks wrong, the `.env` values
are almost certainly pointed at the wrong project or bucket; fix that before
continuing.

### 3. Migrate the files

```bash
node handover/migrate-r2-bucket.mjs
```

This streams every object from the developer's bucket to the client's —
each file is downloaded here and re-uploaded, since the two Cloudflare
accounts cannot read each other's buckets directly. Expect this to take a
while for a multi-gigabyte Knowledge Hub; it prints progress every 25 files.

It is safe to stop and re-run: a file already at the destination with a
matching size is skipped, so an interrupted run resumes rather than starting
over.

### 4. Clone the database

```bash
node handover/clone-database.mjs
```

Copies every collection — content, users, settings, everything — along with
each collection's indexes. By default it **refuses to touch a destination
collection that already has documents in it**, so this cannot be run twice
by accident and silently duplicate data. If you need to intentionally
replace what's there, see the next section.

### 5. Point the client's backend at the new infrastructure

In the client's backend deployment (Render environment variables, or
wherever it is hosted — see the main `README.md`), set:

```
MONGO_URI=<the client's DEST_MONGO_URI>
DB_NAME=<the client's DEST_DB_NAME>

STORAGE_DRIVER=s3
S3_ENDPOINT=<the client's DEST_S3_ENDPOINT>
S3_REGION=<the client's DEST_S3_REGION>
S3_BUCKET=<the client's DEST_S3_BUCKET>
S3_ACCESS_KEY_ID=<the client's DEST_S3_ACCESS_KEY_ID>
S3_SECRET_ACCESS_KEY=<the client's DEST_S3_SECRET_ACCESS_KEY>
S3_PUBLIC_BASE_URL=<the client's bucket's public URL — see .env.example>
```

Then **rotate the credentials that carried over in the clone**:
`JWT_SECRET` should be regenerated (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
and the seeded admin's password changed on first login — the values in the
cloned database were the developer's, not the client's, and both were seen
by more people than a production secret should be.

### 6. Verify

Deploy (or restart) the client's backend with the new environment variables,
then check, on the client's own domain:

- The home page loads and every image renders (proves the R2 migration and
  `S3_PUBLIC_BASE_URL` are both correct).
- A Knowledge Hub document opens and downloads (proves the PDFs themselves
  copied, not just the smaller thumbnails).
- Logging into `/admin` works, and the dashboard shows the same content —
  pages, people, partners — as the developer's site (proves the database
  clone).
- The admin's notification/contact form submits successfully (proves the
  database write path works against the new cluster, not just reads).

## Refreshing the clone right before go-live

If real time passes between running these scripts and the client's site
actually going live, any editing done in the developer's CMS during that
gap will not be on the client's side yet. Two ways to handle it:

- **Freeze content edits** on the developer's side once the clone is done,
  so nothing drifts. Simplest, and fine for a short gap.
- **Re-run both scripts right before cutover.** `migrate-r2-bucket.mjs`
  is always safe to re-run — it only adds what's missing. `clone-database.mjs`
  needs the `--drop` flag to redo a collection that already has data in it:

  ```bash
  node handover/clone-database.mjs --drop
  ```

  **Only do this as the very last step before the client's site goes live**,
  and only when you are certain the destination database has nothing in it
  that the client has already started using — `--drop` deletes every
  document in a collection before replacing it. Once the client's team has
  logged into their own `/admin` and started editing their own content,
  never run this again against that database.

## What this does not cover

- **Application secrets** (`JWT_SECRET`, `SEED_ADMIN_PASSWORD`, `CLIENT_ORIGIN`,
  `PUBLIC_URL`, SMTP credentials) are not part of either clone — they're
  set directly in the client's deployment environment. See the main
  `README.md`'s Environment Variables section.
- **The frontend.** It has no database or storage of its own; it only needs
  `VITE_API_URL` pointed at the client's backend. See `ttel-frontend/README.md`.
- **DNS and the production domain.** Ordinary hosting setup, unrelated to
  either script here.

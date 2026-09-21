# T-TEL Backend

The API and admin CMS behind the T-TEL (Transforming Teaching, Education &
Learning) website: Express + MongoDB, with file storage on Cloudflare R2.

This repository is deployed independently from the frontend — see
[`ttel-frontend`](../ttel-frontend) for the React site that consumes this
API. Deploy them as two separate services; nothing here assumes they share
a host, a filesystem, or a deploy pipeline.

**Handing this project to someone else's infrastructure** — a client's own
MongoDB cluster and Cloudflare account — is covered in
[`handover/README.md`](handover/README.md), not in this file. Read this
README for how the application runs; read that one for how to move it.

## Contents

- [Stack](#stack)
- [Project structure](#project-structure)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [File storage](#file-storage)
- [Running content scripts](#running-content-scripts)
- [Deployment](#deployment)
- [Security checklist before going live](#security-checklist-before-going-live)
- [Troubleshooting](#troubleshooting)

## Stack

- **Express 4** — the API server (`src/server.js`)
- **MongoDB + Mongoose 8** — all content, users and settings
- **Cloudflare R2** (S3-compatible) — uploaded files in production; local
  disk in development
- **JWT in an httpOnly cookie** — admin authentication
- **sharp** — image thumbnails and re-encoding
- **pdf-to-img** (pdfjs under the hood) — Knowledge Hub PDF cover thumbnails

## Project structure

```
src/
  config/       env loading (env.js) and the MongoDB connection (db.js)
  controllers/  request handlers, including the generic CRUD factory that
                powers most of the admin's list/create/edit/trash screens
  middleware/   auth (JWT cookie), file upload (multer), error handling
  models/       Mongoose schemas — one file per collection, re-exported from
                models/index.js
  routes/       admin.js (authenticated CMS routes) and public.js (the
                routes the website itself calls)
  services/     storage.js — the local-disk / S3 driver switch (see below)
  seed/         content and maintenance scripts — see src/seed/README.md
  utils/
  server.js     entry point

handover/       one-time scripts to move this app onto a client's own
                database and bucket — see handover/README.md
uploads/        local file storage (STORAGE_DRIVER=local only)
```

## Local setup

```bash
npm install
cp .env.example .env      # fill in MONGO_URI at minimum — see below
npm run seed               # first time only: creates structure + the admin login
npm run dev                 # starts on PORT (default 5000), restarts on save
```

`npm run seed` needs `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` set in `.env`
to create the first login; without them it skips that step and prints a
warning.

## Environment variables

Every variable is documented inline in **`.env.example`** — copy it to
`.env` and read the comments as you fill each one in; they explain exactly
where to find Cloudflare's values, what each default means, and which
variables only matter in production. The table below is a quick-reference
index into that file, not a replacement for it.

| Variable | Required | Purpose |
|---|---|---|
| `MONGO_URI` | yes | MongoDB connection string |
| `DB_NAME` | no (default `ttel`) | Database name, since a URI often omits it |
| `JWT_SECRET` | yes | Signs admin auth tokens — long random string |
| `JWT_EXPIRES_IN` | no (`7d`) | Session length |
| `CLIENT_ORIGIN` | yes in production | The frontend's exact URL — CORS refuses everything else. Comma-separate more than one origin. |
| `PUBLIC_URL` | yes in production | This API's own URL, used to build absolute links |
| `STORAGE_DRIVER` | no (`local`) | `local` or `s3` — see [File storage](#file-storage) |
| `UPLOAD_DIR` | no (`uploads`) | Local storage path, `local` driver only |
| `MAX_UPLOAD_MB` | no (`25`) | Per-file upload cap |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | yes if `STORAGE_DRIVER=s3` | Cloudflare R2 credentials |
| `S3_PUBLIC_BASE_URL` | recommended if `STORAGE_DRIVER=s3` | The bucket's public URL. Without it, every file request is redirected through a signed URL — slower, and it spends more of the API's own time. |
| `SEED_ADMIN_NAME/EMAIL/PASSWORD` | first `npm run seed` only | Creates the initial admin login |
| `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` | optional | Outbound email for form notifications. Unread submissions still show as an in-dashboard notification with these blank — email is an addition, not a requirement. |
| `TRASH_RETENTION_DAYS` | no (`30`) | How long a trashed item is kept before permanent deletion |

## File storage

`src/services/storage.js` is a small driver switch, chosen by
`STORAGE_DRIVER`:

- **`local`** — files sit on this machine's disk under `UPLOAD_DIR`, served
  by Express directly at `/uploads/*`. Fine for development. **Not safe in
  most production hosting** — Render's filesystem (and most PaaS free/basic
  tiers) is wiped on every deploy and on waking from sleep, so uploads do
  not survive.
- **`s3`** — files go to the configured Cloudflare R2 bucket.
  `/uploads/*` either redirects straight to the bucket's public URL (fast,
  when `S3_PUBLIC_BASE_URL` is set) or streams through a signed URL
  (works either way, a little slower).

Switching between them is one environment variable — `Media.key` is always
the path inside whichever store is active, and `Media.url` is always
relative, so the same database records work under either driver. Moving
existing local files into a bucket for the first time is
`src/seed/migrateToR2.js`; moving files from one bucket to a different one
(a different Cloudflare account entirely) is `handover/migrate-r2-bucket.mjs`.

## Running content scripts

Day-to-day content and maintenance scripts live in `src/seed/` — what each
one does, and whether it's safe to run more than once, is catalogued in
[`src/seed/README.md`](src/seed/README.md). Scripts for moving the whole
application to different infrastructure live in `handover/` instead — see
[`handover/README.md`](handover/README.md).

## Deployment

Deployed on Render (or any Node host with persistent env vars and a public
URL) as a standalone web service, separate from the frontend.

1. **Build command:** `npm install`
2. **Start command:** `npm start`
3. **Health check path:** `/health` — returns `{ ok: true }`
4. Set every variable from [Environment variables](#environment-variables)
   in the host's dashboard. In particular, in production:
   - `NODE_ENV=production`
   - `STORAGE_DRIVER=s3`, with all five `S3_*` values and
     `S3_PUBLIC_BASE_URL` filled in — local storage does not survive a
     redeploy
   - `CLIENT_ORIGIN` set to the frontend's exact production URL (scheme
     included, no trailing slash) — see
     [Troubleshooting](#troubleshooting) if this is wrong
   - `PUBLIC_URL` set to this API's own production URL
5. First deploy only: run `npm run seed` once (Render's shell, or locally
   against the production `MONGO_URI`) to create structure and the first
   admin login — **skip this** if the database was populated by
   `handover/clone-database.mjs` instead; it already has everything.

The server binds to `0.0.0.0`, not the loopback address, which most
container-based hosts (Render included) require to route traffic in.

## Security checklist before going live

- [ ] `JWT_SECRET` is a fresh, long random value — not one that has ever
      appeared in a chat, screenshot or commit.
      `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- [ ] The seeded admin's password has been changed after first login.
- [ ] `NODE_ENV=production` is set (enables the `helmet`/CORS production
      behaviour and quieter logging).
- [ ] `CLIENT_ORIGIN` is the real frontend URL, not `localhost`.
- [ ] `STORAGE_DRIVER=s3` — confirm with `node src/seed/verifyStorage.js`.
- [ ] `npm audit` has been reviewed. At the time of writing it reports one
      high-severity advisory in `sharp`'s bundled `libvips`, fixed by
      upgrading to `sharp@0.35`, which is a breaking change this handover
      did not apply untested — evaluate and upgrade deliberately, with the
      image upload and thumbnail paths re-tested, rather than as a
      drive-by dependency bump.

## Troubleshooting

**CORS error in the browser console, or articles/data not loading.**
`CLIENT_ORIGIN` doesn't exactly match the site's URL — check for `http` vs
`https`, a trailing slash, or the wrong subdomain. The server logs the
allowed origin(s) on startup and logs every refused origin as it happens
(`[cors] refused …`), so the API's own logs say exactly what's mismatched.

**Mixed-content warnings on an HTTPS site, or images not loading.**
Some `Media.url` values are stored as absolute URLs baked in at an earlier
ingest (`http://localhost:5000/...`). `src/seed/relativiseMediaUrls.js`
rewrites them to relative paths, which resolve correctly under either
storage driver and either scheme.

**A file 404s that should exist.** Run
`node src/seed/verifyStorage.js` to check the bucket actually has
everything the database expects; `src/seed/repairMediaKeys.js` fixes a
Media record left pointing at a file that was since renamed.

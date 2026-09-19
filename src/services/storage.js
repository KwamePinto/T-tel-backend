import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

/**
 * Storage interface. Two drivers, chosen by STORAGE_DRIVER.
 *
 *   save(file)              -> { key, url }   url is a PATH, never absolute
 *   remove(key)
 *   resolve(key)            -> absolute local path, or null when remote
 *   downloadUrl(key, name)  -> a URL the browser can fetch, or null to stream
 *
 * URLs are stored as paths so a record never depends on where the API was
 * running when it was written; the front end resolves them at render time.
 */

const local = {
  async save(file) {
    // multer.diskStorage has already written the file; just describe it
    const key = path.relative(env.uploadDir, file.path).split(path.sep).join("/");
    return { key, url: `/uploads/${key}` };
  },

  async remove(key) {
    await fs.promises.rm(path.join(env.uploadDir, key), { force: true });
  },

  resolve(key) {
    return path.join(env.uploadDir, key);
  },

  async downloadUrl() {
    return null; // served straight off disk by the route
  },
};

/* ------------------------------------------------------------------ S3 / R2 */

let client = null;

/** Built lazily so the SDK is only loaded when the driver is actually used. */
async function s3Client() {
  if (client) return client;
  const { S3Client } = await import("@aws-sdk/client-s3");
  client = new S3Client({
    // R2 ignores region but the SDK insists on one; "auto" is what Cloudflare documents
    region: env.s3.region || "auto",
    endpoint: env.s3.endpoint,
    credentials: {
      accessKeyId: env.s3.accessKeyId,
      secretAccessKey: env.s3.secretAccessKey,
    },
    // R2 has no virtual-host style addressing
    forcePathStyle: true,
  });
  return client;
}

const s3 = {
  async save(file) {
    const { Upload } = await import("@aws-sdk/lib-storage");
    const key = path.relative(env.uploadDir, file.path).split(path.sep).join("/");

    await new Upload({
      client: await s3Client(),
      params: {
        Bucket: env.s3.bucket,
        Key: key,
        Body: fs.createReadStream(file.path),
        ContentType: file.mimetype,
        // the library is browsed far more often than it changes
        CacheControl: "public, max-age=2592000",
      },
    }).done();

    // multer wrote it locally first; the local copy is only a staging area
    await fs.promises.rm(file.path, { force: true });

    return { key, url: `/uploads/${key}` };
  },

  async remove(key) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const c = await s3Client();
    await c.send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
  },

  resolve() {
    return null; // not on this filesystem
  },

  /**
   * A short-lived signed URL carrying the original filename, so the browser
   * saves "Chemistry Around Us.pdf" rather than the hashed storage key — and
   * the file travels from R2 to the visitor without passing through the API.
   */
  async downloadUrl(key, filename) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const command = new GetObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      ResponseContentDisposition: filename
        ? `attachment; filename="${filename.replace(/"/g, "")}"`
        : undefined,
    });
    return getSignedUrl(await s3Client(), command, { expiresIn: 300 });
  },
};

const drivers = { local, s3 };

export function storage() {
  const driver = drivers[env.storageDriver];
  if (!driver) {
    throw new Error(
      `Unknown STORAGE_DRIVER "${env.storageDriver}". Supported: ${Object.keys(drivers).join(", ")}`,
    );
  }
  if (env.storageDriver === "s3") {
    const missing = ["endpoint", "bucket", "accessKeyId", "secretAccessKey"]
      .filter((k) => !env.s3[k]);
    if (missing.length) {
      throw new Error(
        `STORAGE_DRIVER=s3 but missing: ${missing.map((k) => `S3_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`).join(", ")}`,
      );
    }
  }
  return driver;
}

/** True when uploads live somewhere other than this machine's disk. */
export const isRemoteStorage = () => env.storageDriver !== "local";

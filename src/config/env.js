import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..");

dotenv.config({ path: path.join(ROOT, ".env") });

function required(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${key}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function optional(key, fallback = "") {
  return process.env[key] ?? fallback;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  isProd: optional("NODE_ENV", "development") === "production",
  port: Number(optional("PORT", 5000)),

  get mongoUri() {
    return required("MONGO_URI");
  },
  get jwtSecret() {
    return required("JWT_SECRET");
  },
  jwtExpiresIn: optional("JWT_EXPIRES_IN", "7d"),
  dbName: optional("DB_NAME", "ttel"),

  clientOrigin: optional("CLIENT_ORIGIN", "http://localhost:5173"),
  publicUrl: optional("PUBLIC_URL", `http://localhost:${optional("PORT", 5000)}`),

  storageDriver: optional("STORAGE_DRIVER", "local"),
  uploadDir: path.isAbsolute(optional("UPLOAD_DIR", "uploads"))
    ? optional("UPLOAD_DIR", "uploads")
    : path.join(ROOT, optional("UPLOAD_DIR", "uploads")),
  maxUploadBytes: Number(optional("MAX_UPLOAD_MB", 25)) * 1024 * 1024,

  s3: {
    endpoint: optional("S3_ENDPOINT"),
    region: optional("S3_REGION"),
    bucket: optional("S3_BUCKET"),
    accessKeyId: optional("S3_ACCESS_KEY_ID"),
    secretAccessKey: optional("S3_SECRET_ACCESS_KEY"),
    publicBaseUrl: optional("S3_PUBLIC_BASE_URL"),
  },

  seedAdmin: {
    name: optional("SEED_ADMIN_NAME", "T-TEL Admin"),
    email: optional("SEED_ADMIN_EMAIL"),
    password: optional("SEED_ADMIN_PASSWORD"),
  },

  mail: {
    host: optional("SMTP_HOST"),
    port: Number(optional("SMTP_PORT", 587)),
    user: optional("SMTP_USER"),
    pass: optional("SMTP_PASS"),
    from: optional("MAIL_FROM", "T-TEL <no-reply@t-tel.org>"),
  },

  trashRetentionDays: Number(optional("TRASH_RETENTION_DAYS", 30)),
};

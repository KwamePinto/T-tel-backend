import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import { env } from "./config/env.js";
import { connectDb } from "./config/db.js";
import adminRoutes from "./routes/admin.js";
import publicRoutes from "./routes/public.js";
import { notFound, errorHandler } from "./middleware/error.js";
import { purgeExpiredTrash } from "./controllers/trashController.js";

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    // uploads are served from this origin and embedded by the site
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  }),
);
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.isProd ? "combined" : "dev"));

const allowedOrigins = env.clientOrigin.split(",").map((s) => s.trim()).filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl, server-to-server
      if (allowedOrigins.includes(origin)) return cb(null, true);
      // in development localhost and 127.0.0.1 are the same machine but
      // different origins, so accept either rather than making it a config trap
      if (!env.isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      cb(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  }),
);

// uploaded files
app.use("/uploads", express.static(env.uploadDir, { maxAge: "30d", fallthrough: true }));

app.get("/health", (req, res) => res.json({ ok: true, env: env.nodeEnv, time: new Date() }));

// brute-force guard on the sign-in endpoint only
app.use(
  "/api/admin/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many sign-in attempts — please wait a few minutes." },
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use("/api/admin", adminRoutes);
app.use("/api", publicRoutes);

app.use(notFound);
app.use(errorHandler);

async function start() {
  try {
    await connectDb();
    await purgeExpiredTrash();
    // 0.0.0.0, not the default: Render and most container hosts route to the
    // container's external interface, and a loopback-only bind fails health checks
    app.listen(env.port, "0.0.0.0", () => {
      console.log(`[api] listening on :${env.port} -> ${env.publicUrl} (${env.nodeEnv})`);
    });
  } catch (err) {
    console.error("[api] failed to start:", err.message);
    process.exit(1);
  }
}

start();

export default app;

import { env } from "../config/env.js";

export function notFound(req, res) {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
}

export function errorHandler(err, req, res, _next) {
  let status = err.status || 500;
  let message = err.message || "Something went wrong";
  let details = err.details;

  if (err.name === "ValidationError") {
    status = 400;
    message = "Validation failed";
    details = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
  }
  if (err.name === "CastError") {
    status = 400;
    message = `Invalid ${err.path}`;
  }
  if (err.code === 11000) {
    status = 409;
    message = "That value is already taken";
    details = err.keyValue;
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    status = 413;
    message = "File is too large";
  }

  if (status >= 500) console.error("[error]", err);

  res.status(status).json({
    error: message,
    ...(details ? { details } : {}),
    ...(env.isProd ? {} : { stack: err.stack }),
  });
}

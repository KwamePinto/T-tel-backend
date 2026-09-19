import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User } from "../models/index.js";
import { ApiError } from "../utils/ApiError.js";

export const TOKEN_COOKIE = "ttel_token";

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

export function setAuthCookie(res, token) {
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: env.isProd ? "none" : "lax",
    secure: env.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res) {
  // sameSite and secure must match how the cookie was set, or the browser
  // treats it as a different cookie and the old one survives the logout
  res.clearCookie(TOKEN_COOKIE, {
    path: "/",
    httpOnly: true,
    sameSite: env.isProd ? "none" : "lax",
    secure: env.isProd,
  });
}

// Reads the token from the cookie, or an Authorization: Bearer header.
export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = req.cookies?.[TOKEN_COOKIE] || (header.startsWith("Bearer ") ? header.slice(7) : null);
    if (!token) throw ApiError.unauthorized();

    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user) throw ApiError.unauthorized("Account no longer exists");

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return next(ApiError.unauthorized("Session expired — please sign in again"));
    }
    next(err);
  }
}

// Role gate. Admins always pass.
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role === "admin" || roles.includes(req.user.role)) return next();
  next(ApiError.forbidden());
};

export const requireAdmin = requireRole("admin");
export const requireEditor = requireRole("editor");

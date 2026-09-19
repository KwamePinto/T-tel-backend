import { User, Setting } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { signToken, setAuthCookie, clearAuthCookie } from "../middleware/auth.js";

const publicUser = (u) => ({
  id: u._id, name: u.name, email: u.email, role: u.role, avatar: u.avatar, createdAt: u.createdAt,
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw ApiError.badRequest("Email and password are required");

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select("+password");
  // same message either way, so the form can't be used to discover accounts
  if (!user || !(await user.verifyPassword(password))) {
    throw ApiError.unauthorized("Those details don't match an account");
  }

  user.lastLoginAt = new Date();
  await user.save();

  setAuthCookie(res, signToken(user));
  res.json({ user: publicUser(user) });
});

export const logout = asyncHandler(async (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, email, avatar, currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select("+password");

  if (name) user.name = name;
  if (email) user.email = String(email).toLowerCase().trim();
  if (avatar !== undefined) user.avatar = avatar || null;

  if (newPassword) {
    if (!currentPassword || !(await user.verifyPassword(currentPassword))) {
      throw ApiError.badRequest("Your current password is incorrect");
    }
    user.password = newPassword;
  }

  await user.save();
  res.json({ user: publicUser(user) });
});

export const register = asyncHandler(async (req, res) => {
  const settings = await Setting.asObject("auth");
  if (!settings.allow_registration) {
    throw ApiError.forbidden(settings.registration_message || "Public registration is disabled");
  }
  const { name, email, password } = req.body;
  if (!name || !email || !password) throw ApiError.badRequest("Name, email and password are required");
  if (String(password).length < 8) throw ApiError.badRequest("Password must be at least 8 characters");

  const exists = await User.exists({ email: String(email).toLowerCase().trim() });
  if (exists) throw ApiError.conflict("An account with that email already exists");

  const user = await User.create({
    name, email, password, role: settings.registration_role || "user",
  });
  setAuthCookie(res, signToken(user));
  res.status(201).json({ user: publicUser(user) });
});

import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

// Thin storage interface. Local disk today; swapping STORAGE_DRIVER to "s3"
// only requires implementing the same three methods, no call-site changes.
const local = {
  async save(file) {
    // multer.diskStorage has already written the file; just describe it
    const key = path.relative(env.uploadDir, file.path).split(path.sep).join("/");
    return { key, url: `${env.publicUrl}/uploads/${key}` };
  },
  async remove(key) {
    const full = path.join(env.uploadDir, key);
    await fs.promises.rm(full, { force: true });
  },
  resolve(key) {
    return path.join(env.uploadDir, key);
  },
};

const drivers = { local };

export function storage() {
  const driver = drivers[env.storageDriver];
  if (!driver) {
    throw new Error(
      `Unknown STORAGE_DRIVER "${env.storageDriver}". Supported: ${Object.keys(drivers).join(", ")}`,
    );
  }
  return driver;
}

import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

// Thin storage interface. Local disk today; swapping STORAGE_DRIVER to "s3"
// only requires implementing the same three methods, no call-site changes.
const local = {
  async save(file) {
    // multer.diskStorage has already written the file; just describe it
    const key = path.relative(env.uploadDir, file.path).split(path.sep).join("/");
    // Relative, never absolute. Baking the host in at upload time means every
    // record breaks the moment the API moves — which is exactly what happened
    // to the images imported on a laptop and then served from Render. The
    // front end resolves these against VITE_API_URL at render time.
    return { key, url: `/uploads/${key}` };
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

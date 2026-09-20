/**
 * Adds the Telephone field to the live Contact Us form, if it isn't there yet.
 *
 *   node src/seed/addContactPhoneField.js [--dry]
 *
 * Safe to re-run: a form that already has a "phone" field is left untouched.
 */
import { connectDb, disconnectDb } from "../config/db.js";
import { Form } from "../models/index.js";

const DRY = process.argv.includes("--dry");

await connectDb();

const form = await Form.findOne({ slug: "contact-us" });
if (!form) throw new Error("contact-us form not found — run the main seed first.");

if (form.fields.some((f) => f.name === "phone")) {
  console.log("phone field already present — nothing to do");
} else {
  const nameIndex = form.fields.findIndex((f) => f.name === "email");
  const phoneField = {
    type: "tel", label: "Telephone", name: "phone", required: false,
    placeholder: "(+233) 055 435 7370", width: "half",
  };
  const insertAt = nameIndex >= 0 ? nameIndex + 1 : form.fields.length;
  form.fields.splice(insertAt, 0, phoneField);

  console.log(`fields now: ${form.fields.map((f) => f.name).join(", ")}`);

  if (!DRY) {
    await form.save();
    console.log("saved");
  } else {
    console.log("[dry run] nothing written");
  }
}

await disconnectDb();

import { connectDb, disconnectDb } from "../config/db.js";
import { Setting } from "../models/index.js";
import { THEME_SETTINGS } from "./defaults.js";

const keys = [
  "show_cta_band", "cta_heading", "cta_body", "cta_image",
  "cta_email_label", "cta_email", "cta_contact_label", "cta_contact_url",
  "social_facebook_icon", "social_twitter_icon", "social_instagram_icon",
  "social_linkedin_icon", "social_youtube_icon", "social_flickr_icon",
];

await connectDb();
for (const key of keys) {
  const def = THEME_SETTINGS[key];
  const update = {
    $set: {
      group: "theme",
      type: def.type,
      label: key.replaceAll("_", " "),
      section: key.startsWith("social_") ? "Social Links" : "Contact band",
      hint: "",
      options: def.type === "select" ? ["facebook", "twitter", "instagram", "linkedin", "youtube", "flickr"] : undefined,
    },
    $setOnInsert: { value: def.value },
  };
  await Setting.updateOne({ key }, update, { upsert: true });
}
console.log("CTA settings ensured");
await disconnectDb();

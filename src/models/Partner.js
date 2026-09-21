import mongoose from "mongoose";

// Groups are database records; these values remain seed defaults for migrations.
export const PARTNER_GROUPS = ["funder", "government", "university", "implementing", "research"];

const partnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },

    /**
     * A partner can stand in more than one section: the same institution is
     * routinely both a government partner and a funder, and the Our Partners
     * page lists it under each. Membership is therefore a list of group slugs,
     * edited as checkboxes rather than a single select.
     *
     * At least one is required — a partner in no group is on no page, which is
     * never what someone meant to save.
     */
    groups: {
      type: [String],
      default: [],
      index: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "Choose at least one group.",
      },
    },

    /**
     * The single group this used to hold. Kept as a mirror of `groups[0]` so
     * anything still reading `group` — an export, an older client — sees the
     * first group, and so records written before `groups` existed still
     * resolve. `groups` is the source of truth; see the hook below.
     */
    group: { type: String, default: "" },

    logo: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
    description: { type: String, default: "" },
    url: { type: String, default: "" },
    isPrincipal: { type: Boolean, default: false },
    showOnHome: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },

    /**
     * Per-language overrides, as { fr: { title, body, … } }.
     *
     * Only the fields that have been translated need to be present — the API
     * falls back field by field, so a record can be translated a piece at a
     * time and stay readable throughout. See utils/localise.js.
     */
    translations: { type: mongoose.Schema.Types.Mixed, default: {} },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

/**
 * Keeps `group` in step with `groups`.
 *
 * Creating a partner with only the legacy `group` folds it into the list —
 * that is the one direction the old field is still allowed to travel. An
 * empty list on an existing record is left alone rather than re-filled from
 * the stale mirror, so unticking the last box actually empties it rather than
 * bouncing back off the old value.
 */
partnerSchema.pre("validate", function syncGroupMirror() {
  if (!this.groups?.length && this.group && this.isNew) this.groups = [this.group];
  this.group = this.groups?.[0] || "";
});

export const Partner = mongoose.model("Partner", partnerSchema);

import mongoose from "mongoose";

export const FIELD_TYPES = ["text","email","textarea","number","tel","url","select","radio","checkbox","date","file"];

const formSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: "" },
    fields: [
      {
        _id: false,
        type: { type: String, enum: FIELD_TYPES, default: "text" },
        label: { type: String, required: true },
        name: { type: String, required: true },
        required: { type: Boolean, default: false },
        placeholder: { type: String, default: "" },
        options: [String],
        defaultValue: { type: String, default: "" },
        width: { type: String, enum: ["full", "half"], default: "full" },
      },
    ],
    settings: {
      submitLabel: { type: String, default: "Send message" },
      buttonPosition: { type: String, enum: ["left", "center", "right"], default: "left" },
      successMessage: { type: String, default: "Thanks — we'll get back to you shortly." },
      redirectUrl: { type: String, default: "" },
      notifyEmails: { type: String, default: "" },
      storeSubmissions: { type: Boolean, default: true },
      honeypot: { type: Boolean, default: true },
      requireAuth: { type: Boolean, default: false },
    },
    status: { type: String, enum: ["active", "inactive"], default: "active", index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

export const Form = mongoose.model("Form", formSchema);

const submissionSchema = new mongoose.Schema(
  {
    form: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    ip: String,
    userAgent: String,
    isRead: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

export const FormSubmission = mongoose.model("FormSubmission", submissionSchema);

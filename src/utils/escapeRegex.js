// Escapes user input so it can be used safely inside a RegExp.
// Without this, a search for "c++" or "(draft)" throws, and a crafted string
// can be used to mount a denial-of-service via catastrophic backtracking.
export function escapeRegex(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

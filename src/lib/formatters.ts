export function formatModelLabel(input?: string | null): string {
  if (!input) return "";
  // Normalize common whitespace and trim
  let s = String(input).trim();
  // Replace any case-insensitive occurrence of 'idface' with 'iDFace'
  s = s.replace(/idface/gi, "iDFace");
  return s;
}
export function formatModelLabel(input?: string | null): string {
  if (!input) return "";
  // Normalize common whitespace and trim
  let s = String(input).trim();
  // Replace any case-insensitive occurrence of 'idface' with 'iDFace'
  s = s.replace(/idface/gi, "iDFace");
  return s;
}

/**
 * Format a number or numeric string into Brazilian currency format:
 * Examples:
 *  - 1368.81666666667  => "R$ 1.368,82"
 *  - "1.368,81666666667" => "R$ 1.368,82"
 *  - "1368,81666666667" => "R$ 1.368,82"
 */
export function formatCurrencyBRL(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === "") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(0);
  }

  let num: number;

  if (typeof value === "number") {
    num = value;
  } else {
    // Try to parse strings that may use comma as decimal separator or have thousands separators
    // Remove spaces, then remove thousands separators (.) and replace decimal comma (,) with dot (.)
    const cleaned = String(value).trim().replace(/\s+/g, "").replace(/\./g, "").replace(/,/g, ".");
    num = parseFloat(cleaned);
  }

  if (!isFinite(num) || Number.isNaN(num)) {
    num = 0;
  }

  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}
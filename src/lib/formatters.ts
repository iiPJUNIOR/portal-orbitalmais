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
    // Remove spaces, then handle patterns:
    // - "1.368,81" -> remove dots (thousands) then replace comma with dot -> "1368.81"
    // - "1368,81"  -> replace comma with dot -> "1368.81"
    // - "1368.81"  -> keep as-is
    // Also allow messy inputs that include currency symbols or whitespace.
    const raw = String(value).trim();
    if (raw === "") {
      num = 0;
    } else {
      let s = raw.replace(/\s+/g, "");
      // If both '.' and ',' are present, assume '.' are thousand separators and ',' is decimal separator.
      if (s.indexOf(",") > -1 && s.indexOf(".") > -1) {
        s = s.replace(/\./g, "").replace(/,/g, ".");
      } else if (s.indexOf(",") > -1 && s.indexOf(".") === -1) {
        // only comma present -> it's the decimal separator
        s = s.replace(/,/g, ".");
      } else {
        // only dots or neither -> remove non-number except dot and minus
        s = s.replace(/[^\d.\-]/g, "");
      }
      num = parseFloat(s);
      if (!isFinite(num) || Number.isNaN(num)) num = 0;
    }
  }

  if (!isFinite(num) || Number.isNaN(num)) {
    num = 0;
  }

  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

/**
 * Parse a numeric value coming from spreadsheets into a proper JavaScript number.
 * Handles formats like:
 *  - "1.368,81666666667"
 *  - "1368,81666666667"
 *  - "1368.81666666667"
 *  - "R$ 1.368,82"
 * Returns 0 on invalid input.
 */
export function parseSpreadsheetNumber(value: any): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return value;

  const raw = String(value).trim();
  if (raw === "") return 0;

  let s = raw.replace(/\s+/g, "");

  // Remove common currency prefix/suffix
  s = s.replace(/^(R\$|€|\$)\s*/, "").replace(/(R\$|€|\$)$/, "");

  // If both '.' and ',' exist -> '.' is thousands, ',' is decimal
  if (s.indexOf(",") > -1 && s.indexOf(".") > -1) {
    s = s.replace(/\./g, "").replace(/,/g, ".");
  } else if (s.indexOf(",") > -1 && s.indexOf(".") === -1) {
    // only comma -> decimal separator
    s = s.replace(/,/g, ".");
  } else {
    // keep dots as decimal separator, strip any non-digit/dot/minus
    s = s.replace(/[^\d.\-]/g, "");
  }

  const n = parseFloat(s);
  if (!isFinite(n) || Number.isNaN(n)) return 0;
  return n;
}
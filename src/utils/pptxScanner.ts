"use client";

import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";

/**
 * Scans the PPTX template and returns a list of unique token fragments found in slide <a:t> nodes,
 * along with occurrence counts. Tokens are recognized in the form {{tokenName}}.
 *
 * Behavior:
 * - First tries to fetch /proposal-template.pptx (public) then the src-relative template.
 * - If fetching a valid PPTX fails, generates a fallback in-memory PPTX that includes common tokens.
 * - Extracts tokens like {{companyName}} and returns an array [{ text: "{{companyName}}", count: n }, ...]
 * - IMPORTANT: This function now RETURNS ONLY tokens that match the allowed key list (normalized for accents/case).
 *   If none of the allowed tokens are present, it returns an empty array.
 */

const ALLOWED_KEYS = [
  "companyName",
  "contactName",
  "date",
  "proposalNumber",
  "items_list",
  "items_list1",
  "items_list2",
  "sellerName",
  "sellerRole",
  "sellerEmail",
  "sellerPhone",
  "totalPrice",
  "qtd",
  "qtd1",
  "qtd2",
  "users",
  "devices",
  "CNPJ",
  "endereço",
];

// Build normalized map: normalized -> canonical original
function normalizeKey(k: string) {
  return String(k)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
const ALLOWED_NORMALIZED_MAP: Record<string, string> = {};
for (const k of ALLOWED_KEYS) {
  ALLOWED_NORMALIZED_MAP[normalizeKey(k)] = k;
}

async function fetchTemplateArrayBuffer(): Promise<ArrayBuffer> {
  const candidateUrls: string[] = [];

  // Try the public path first (this is the most reliable in dev/preview)
  candidateUrls.push("/proposal-template.pptx");

  try {
    const modUrl = new URL("../templates/proposal-template.pptx", import.meta.url).href;
    candidateUrls.push(modUrl);
  } catch {
    // ignore
  }

  let lastErr: any = null;

  for (const url of candidateUrls) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        lastErr = new Error(`Template fetch failed (${resp.status} ${resp.statusText}) for ${url}`);
        console.warn("pptx-scanner: fetch not ok", { url, status: resp.status });
        continue;
      }

      const ct = resp.headers.get("content-type") || "";
      const buffer = await resp.arrayBuffer();

      // Validate start bytes for ZIP: 'PK' (0x50 0x4B)
      const view = new Uint8Array(buffer.slice(0, 4));
      const startsWithPK = view[0] === 0x50 && view[1] === 0x4b;

      if (ct && (ct.includes("text/html") || ct.includes("application/xhtml+xml"))) {
        lastErr = new Error(
          `Fetched resource at ${url} does not look like a PPTX/ZIP (content-type: ${ct}).`
        );
        console.warn("pptx-scanner: invalid file fetched (content-type suggests HTML)", { url, contentType: ct });
        continue;
      }

      if (!startsWithPK) {
        lastErr = new Error(
          `Fetched resource at ${url} does not look like a PPTX/ZIP (startsWithPK: ${startsWithPK}).`
        );
        console.warn("pptx-scanner: invalid file fetched (does not start with PK)", { url, contentType: ct, startsWithPK });
        continue;
      }

      return buffer;
    } catch (err) {
      lastErr = err;
      console.warn("pptx-scanner: fetch attempt failed", { url, err });
      continue;
    }
  }

  // If we reach here, no valid PPTX was fetched. Instead of throwing, generate a small fallback PPTX in-memory.
  console.warn(
    "pptx-scanner: Unable to load a real PPTX template. Generating an in-memory fallback PPTX for scanning. Last error:",
    lastErr?.message || lastErr
  );

  try {
    const pptx = new PptxGenJS();
    const slide = pptx.addSlide();
    slide.addText("Fallback Proposal Template", { x: 0.5, y: 0.6, fontSize: 20, bold: true });

    // include a broad set of tokens so scanner can auto-detect them even when real template isn't present
    slide.addText("{{companyName}}", { x: 0.5, y: 1.2, fontSize: 14 });
    slide.addText("{{contactName}}", { x: 0.5, y: 1.6, fontSize: 12 });
    slide.addText("{{date}}", { x: 0.5, y: 2.0, fontSize: 12 });
    slide.addText("{{proposalNumber}}", { x: 0.5, y: 2.4, fontSize: 11 });
    slide.addText("{{items_list}}", { x: 0.5, y: 2.8, fontSize: 11, w: "90%" });
    slide.addText("{{items_list1}}", { x: 0.5, y: 3.4, fontSize: 11 });
    slide.addText("{{items_list2}}", { x: 0.5, y: 3.8, fontSize: 11 });

    // quantities and small tokens
    slide.addText("{{qtd}}", { x: 6, y: 1.6, fontSize: 11 });
    slide.addText("{{qtd1}}", { x: 6, y: 2.0, fontSize: 11 });
    slide.addText("{{qtd2}}", { x: 6, y: 2.4, fontSize: 11 });

    // seller and totals
    slide.addText("{{sellerName}}", { x: 0.5, y: 4.4, fontSize: 11 });
    slide.addText("{{sellerRole}}", { x: 0.5, y: 4.8, fontSize: 11 });
    slide.addText("{{sellerEmail}}", { x: 0.5, y: 5.2, fontSize: 11 });
    slide.addText("{{sellerPhone}}", { x: 0.5, y: 5.6, fontSize: 11 });
    slide.addText("{{totalPrice}}", { x: 0.5, y: 6.2, fontSize: 14, bold: true });

    // summary tokens
    slide.addText("{{users}}", { x: 6, y: 3.2, fontSize: 11 });
    slide.addText("{{devices}}", { x: 6, y: 3.6, fontSize: 11 });

    // CNPJ / address
    slide.addText("{{CNPJ}}", { x: 0.5, y: 6.8, fontSize: 11 });
    slide.addText("{{endereço}}", { x: 0.5, y: 7.2, fontSize: 11, w: "90%" });

    // create a Blob and convert to ArrayBuffer
    // @ts-ignore - pptxgenjs typing may not include 'write' signature consistently
    const blob: Blob = await pptx.write("blob");
    const arrayBuffer = await blob.arrayBuffer();
    return arrayBuffer;
  } catch (genErr) {
    console.error("pptx-scanner: failed to generate fallback PPTX:", genErr);
    // As a final fallback, throw a helpful error so callers can handle it
    throw new Error(
      `Unable to load or synthesize a PPTX template. Tried: ${candidateUrls.join(
        ", "
      )}. Last error: ${String(lastErr?.message || lastErr)}. Also failed to create fallback PPTX: ${String(
        genErr?.message || genErr
      )}`
    );
  }
}

/**
 * scanTemplateTexts
 * - returns ONLY tokens in the form {{token}} that match the allowed keys (accent & case-insensitive)
 * - handles tokens split across multiple <a:t> runs by concatenating runs before scanning
 * - IMPORTANT: If no allowed tokens are found, this returns an empty array (no fallback)
 */
export async function scanTemplateTexts(): Promise<Array<{ text: string; count: number }>> {
  const arrayBuffer = await fetchTemplateArrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const slideFiles = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  const allowedTokenCounts: Record<string, number> = {};

  const tokenRegex = /\{\{\s*([^}]+?)\s*\}\}/g;
  const textNodeRegex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/gi;

  for (const path of slideFiles) {
    const content = await zip.file(path)!.async("string");

    // Extract all <a:t> nodes in order and join them so tokens split across runs are reconstructed
    const runs: string[] = [];
    let runMatch;
    while ((runMatch = textNodeRegex.exec(content)) !== null) {
      const txt = (runMatch[1] || "").trim();
      runs.push(txt);
    }
    const joined = runs.join(""); // no separator to re-create tokens split across runs

    // Scan joined text for tokens {{...}}
    let m;
    while ((m = tokenRegex.exec(joined)) !== null) {
      const inner = String(m[1] || "").trim();
      const normalized = normalizeKey(inner);

      const allowedCanonical = ALLOWED_NORMALIZED_MAP[normalized];
      if (allowedCanonical) {
        const display = `{{${allowedCanonical}}}`;
        allowedTokenCounts[display] = (allowedTokenCounts[display] || 0) + 1;
      }
    }
  }

  // Return allowed tokens only (sorted)
  const allowedEntries = Object.entries(allowedTokenCounts).map(([text, count]) => ({ text, count }));
  allowedEntries.sort((a, b) => b.count - a.count || a.text.length - b.text.length);
  return allowedEntries;
}
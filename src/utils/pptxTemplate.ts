"use client";

import JSZip from "jszip";

/**
 * PPTX template processor.
 * - Loads template PPTX (prefer /proposal-template.pptx from public/).
 * - Replaces tokens in the form {{token}} across all slide XMLs.
 * - Also replaces exact source strings mapped in localStorage under 'pptx_token_map'.
 * - RETURNS a Blob (.pptx) ready for upload/download.
 *
 * Note: This version intentionally does NOT blank entire slides when they are considered 'not needed'.
 *       Keeping slides intact prevents unexpected blank pages and layout breakage when template slide
 *       numbering or structure differs from assumptions. If you want to remove unused slides later,
 *       we can introduce a safer selective removal mechanism.
 */

export interface PptxGenerateOptions {
  replacements: Record<string, string | number>;
  modelNames?: string[];
  flags?: {
    botoeira?: boolean;
    idfaceEntry?: boolean;
    idfaceExit?: boolean;
    idAccessNanoEntry?: boolean;
    idFlexProEntry?: boolean;
    idFlexProGlass?: boolean;
    hasCatraca?: boolean;
    systemIncluded?: boolean;
  };
  keepSlidesOverride?: number[] | null;
}

/* model -> slide mapping kept for potential future use */
const MODEL_TO_SLIDE: Array<{ key: string; slide: number }> = [
  { key: "idface pro", slide: 19 },
  { key: "idface max", slide: 20 },
  { key: "idflex ip65", slide: 22 },
  { key: "idaccess nano", slide: 21 },
  { key: "idflex pro", slide: 23 },
  { key: "idaccess", slide: 24 },
  { key: "idfit 4x2", slide: 25 },
  { key: "idaccess pro", slide: 26 },
  { key: "secbox", slide: 27 },
  { key: "iduhf lite", slide: 29 },
  { key: "iduhf", slide: 28 },
  { key: "idblock next catraca inteligente com reconhecimento facial", slide: 30 },
  { key: "idblock next catraca inteligente com biometria", slide: 31 },
  { key: "idblock facial inox", slide: 32 },
  { key: "idblock facial preta", slide: 33 },
  { key: "idblock facial mini preta", slide: 34 },
  { key: "idblock facial mini inox", slide: 35 },
  { key: "idblock inox catraca biométrica", slide: 36 },
  { key: "idblock preta catraca biométrica", slide: 37 },
  { key: "idblock braço articulado inox", slide: 38 },
  { key: "idblock braço articulado preta", slide: 39 },
  { key: "idblock balcão", slide: 40 },
  { key: "idblock pne", slide: 41 },
  { key: "torniquete fet 100", slide: 42 },
  { key: "idpower", slide: 43 },
  { key: "idprox usb", slide: 44 },
  { key: "idbio", slide: 45 },
];

/**
 * Read mapping from localStorage.
 * Expected shape: { [replacementKey]: "Exact source text in PPTX to replace" }
 */
function loadPlainMapping(): Record<string, string> {
  try {
    const raw = localStorage.getItem("pptx_token_map");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, string>;
    }
  } catch {
    // ignore
  }
  return {};
}

/**
 * Replace tokens in slide XML content.
 * - Handles tokens split across multiple <a:t> runs by concatenating runs, applying replacements,
 *   and writing the replaced string back into the first run while clearing subsequent runs.
 * - Also applies plain-text replacements from localStorage mapping.
 *
 * Note: This approach is conservative — it performs replacements but does not alter slide structure or remove runs entirely
 * except clearing text content of subsequent runs to avoid duplicating text. This helps ensure tokens are replaced even if the PPTX split them.
 */
function applyReplacementsToXml(xml: string, replacements: Record<string, string | number>) {
  const debug = (typeof window !== "undefined" && localStorage.getItem("pptx_debug") === "1") || false;

  const textNodeRegex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/gi;
  const runs: string[] = [];
  let match;
  while ((match = textNodeRegex.exec(xml)) !== null) {
    runs.push(match[1] ?? "");
  }

  const applyReplacementsToString = (input: string) => {
    let out = input;

    // tokenized placeholders like {{companyName}}
    for (const [key, val] of Object.entries(replacements || {})) {
      const token = `{{${key}}}`;
      out = out.split(token).join(String(val ?? ""));
    }

    // plain-text mapped sources (if any)
    const plainMap = loadPlainMapping();
    for (const [replacementKey, sourceText] of Object.entries(plainMap)) {
      if (!sourceText) continue;
      const replacementValue = String(replacements[replacementKey] ?? "");
      out = out.split(sourceText).join(replacementValue);
    }

    return out;
  };

  if (runs.length > 0) {
    const joined = runs.join("");
    if (debug) {
      try {
        console.debug("[pptx-template] slide-run-joined-snippet:", joined.slice(0, 300));
      } catch {}
    }

    const replacedJoined = applyReplacementsToString(joined);

    if (joined === replacedJoined) {
      // No changes needed
      return xml;
    }

    if (debug) {
      try {
        console.debug("[pptx-template] slide-run-replaced-snippet:", replacedJoined.slice(0, 300));
      } catch {}
    }

    // Put the replaced text into the first run and clear the remaining runs' text nodes.
    // This preserves run-level formatting of the first run and avoids duplicating fragments.
    let i = 0;
    const rebuilt = xml.replace(/(<a:t[^>]*>)([\s\S]*?)(<\/a:t>)/gi, (_full, openTag, inner, closeTag) => {
      i += 1;
      if (i === 1) {
        return openTag + replacedJoined + closeTag;
      }
      return openTag + "" + closeTag;
    });

    return rebuilt;
  }

  // Fallback: simple replacements if no runs found
  let out = xml;
  for (const [key, val] of Object.entries(replacements || {})) {
    const token = `{{${key}}}`;
    out = out.split(token).join(String(val ?? ""));
  }
  const plainMap = loadPlainMapping();
  for (const [replacementKey, sourceText] of Object.entries(plainMap)) {
    if (!sourceText) continue;
    const replacementValue = String(replacements[replacementKey] ?? "");
    out = out.split(sourceText).join(replacementValue);
  }
  return out;
}

/**
 * Attempt to fetch a PPTX template from candidate URLs.
 * Validate the response looks like a zip (PK bytes).
 */
async function fetchTemplateArrayBufferFromCandidates(candidateUrls: string[]) {
  let lastErr: any = null;

  for (const url of candidateUrls) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        lastErr = new Error(`Template fetch failed (${resp.status} ${resp.statusText}) for ${url}`);
        continue;
      }

      const ct = resp.headers.get("content-type") || "";
      const buffer = await resp.arrayBuffer();

      const view = new Uint8Array(buffer.slice(0, 4));
      const startsWithPK = view[0] === 0x50 && view[1] === 0x4b;

      if (ct && (ct.includes("text/html") || ct.includes("application/xhtml+xml"))) {
        lastErr = new Error(
          `Fetched resource at ${url} does not look like a PPTX/ZIP (content-type: ${ct}).`
        );
        continue;
      }

      if (!startsWithPK) {
        lastErr = new Error(
          `Fetched resource at ${url} does not look like a PPTX/ZIP (startsWithPK: ${startsWithPK}).`
        );
        continue;
      }

      return buffer;
    } catch (err) {
      lastErr = err;
      continue;
    }
  }

  throw lastErr ?? new Error("Unable to fetch a valid PPTX template from candidates.");
}

export async function generatePptxFromTemplate(opts: PptxGenerateOptions): Promise<Blob> {
  const debug = (typeof window !== "undefined" && localStorage.getItem("pptx_debug") === "1") || false;

  // Candidate URLs: try public path first, then bundled template path
  const candidateUrls: string[] = ["/proposal-template.pptx"];
  try {
    const modUrl = new URL("../templates/proposal-template.pptx", import.meta.url).href;
    candidateUrls.push(modUrl);
  } catch {
    // ignore
  }

  if (debug) console.debug("[pptx-template] template candidate urls:", candidateUrls);

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await fetchTemplateArrayBufferFromCandidates(candidateUrls);
    if (debug) console.debug("[pptx-template] fetched valid template arrayBuffer size:", arrayBuffer.byteLength);
  } catch (fetchErr) {
    console.error("[pptx-template] failed to fetch a valid template from candidates:", fetchErr);
    throw fetchErr;
  }

  const zip = await JSZip.loadAsync(arrayBuffer);

  // Process every slide: apply token replacements but DO NOT blank slides.
  const slideFiles = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  if (debug) {
    try {
      console.debug("[pptx-template] detected slide files:", slideFiles.length);
    } catch {}
  }

  for (const path of slideFiles) {
    const content = await zip.file(path)!.async("string");

    if (debug) {
      try {
        const match = path.match(/slide(\d+)\.xml$/);
        const slideNumber = match ? parseInt(match[1], 10) : NaN;
        console.debug(`[pptx-template] processing ${path} (slide ${String(slideNumber)}) - original length ${content.length}`);
      } catch {}
    }

    // Apply replacements and always keep the slide (no blanking).
    const replaced = applyReplacementsToXml(content, opts.replacements || {});
    zip.file(path, replaced);
  }

  const newZipBlob = await zip.generateAsync({ type: "blob" });

  if (debug) {
    try {
      console.debug("[pptx-template] generated new pptx blob size:", (newZipBlob as Blob).size);
    } catch {}
  }

  return newZipBlob;
}
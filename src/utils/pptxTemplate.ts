"use client";

import JSZip from "jszip";

/**
 * PPTX template processor.
 * - Loads template PPTX (prefer /proposal-template.pptx from public/).
 * - Replaces tokens in the form {{token}} across all slide XMLs.
 * - Also replaces exact source strings mapped in localStorage under 'pptx_token_map'.
 * - RETURNS a Blob (.pptx) ready for upload/download.
 *
 * Important change:
 * - Substituições agora são aplicadas por bloco <a:txBody> (cada caixa de texto/shape),
 *   evitando concatenar runs de diferentes shapes (isso previne páginas em branco e perda de texto).
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
 * Apply replacements (tokens and plain-text mapped sources) to a string.
 */
function applyReplacementsToString(input: string, replacements: Record<string, string | number>) {
  let out = input;

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
 * Process a block of XML corresponding to a <a:txBody>...</a:txBody>.
 * Reconstruct runs inside the block, replace tokens that might be split across runs,
 * and then write replaced text into the first run while clearing others (preserving first-run formatting).
 */
function processTxBodyBlock(blockContent: string, replacements: Record<string, string | number>, debug = false) {
  const textNodeRegex = /(<a:t[^>]*>)([\s\S]*?)(<\/a:t>)/gi;
  const runs: string[] = [];
  let match;
  // Collect runs
  while ((match = textNodeRegex.exec(blockContent)) !== null) {
    runs.push(match[2] ?? "");
  }

  if (runs.length === 0) {
    return blockContent;
  }

  const joined = runs.join("");
  if (debug) {
    try {
      console.debug("[pptx-template] txBody-joined-snippet:", joined.slice(0, 300));
    } catch {}
  }

  const replacedJoined = applyReplacementsToString(joined, replacements);

  if (joined === replacedJoined) {
    // nothing changed in this block
    return blockContent;
  }

  if (debug) {
    try {
      console.debug("[pptx-template] txBody-replaced-snippet:", replacedJoined.slice(0, 300));
    } catch {}
  }

  // Replace first <a:t> content with replacedJoined and clear the rest within this block only.
  let i = 0;
  const rebuilt = blockContent.replace(textNodeRegex, (_full, openTag, inner, closeTag) => {
    i += 1;
    if (i === 1) {
      return openTag + replacedJoined + closeTag;
    }
    return openTag + "" + closeTag;
  });

  return rebuilt;
}

/**
 * As a final fallback: apply simple global replacements across XML (no run consolidation),
 * so tokens outside <a:txBody> blocks are still handled.
 */
function applyGlobalStringReplacements(xml: string, replacements: Record<string, string | number>) {
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
 * Attempt to fetch a PPTX template from a list of candidate URLs.
 * Validates that fetched content looks like a ZIP/PPTX by checking PK header bytes.
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

    // Process per <a:txBody> block (each text box / shape)
    const txBodyRegex = /(<a:txBody[^>]*>)([\s\S]*?)(<\/a:txBody>)/gi;
    let modifiedContent = content;
    let anyTxBodyMatched = false;

    modifiedContent = modifiedContent.replace(txBodyRegex, (fullMatch, openTag, body, closeTag) => {
      anyTxBodyMatched = true;
      const processedBody = processTxBodyBlock(body, opts.replacements || {}, debug);
      return openTag + processedBody + closeTag;
    });

    // If no <a:txBody> matched (rare), fall back to processing whole slide content with run consolidation
    if (!anyTxBodyMatched) {
      // process entire slide as a single block (preserve previous behavior)
      const processed = processTxBodyBlock(modifiedContent, opts.replacements || {}, debug);
      modifiedContent = processed;
    }

    // Finally, apply simple global replacements to catch tokens outside txBody blocks
    modifiedContent = applyGlobalStringReplacements(modifiedContent, opts.replacements || {});

    zip.file(path, modifiedContent);
  }

  const newZipBlob = await zip.generateAsync({ type: "blob" });

  if (debug) {
    try {
      console.debug("[pptx-template] generated new pptx blob size:", (newZipBlob as Blob).size);
    } catch {}
  }

  return newZipBlob;
}
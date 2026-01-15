"use client";

import JSZip from "jszip";

/**
 * PPTX template processor.
 * - Loads template PPTX (prefer /proposal-template.pptx from public/).
 * - Replaces tokens in the form {{token}} across all slide XMLs.
 * - Also replaces exact source strings mapped in localStorage under 'pptx_token_map'.
 * - Blanks slides that are not in the keepSlides set.
 * - Returns a Blob (.pptx) ready for upload/download.
 *
 * Debugging:
 * - Set localStorage.setItem('pptx_debug', '1') to enable verbose per-slide logs.
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

/* model -> slide mapping (same as before) */
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

function resolveKeepSlides(opts: PptxGenerateOptions): Set<number> {
  const keep = new Set<number>();
  for (let i = 1; i <= 18; i++) keep.add(i);
  keep.add(46);

  const models = (opts.modelNames || []).map((m) => (m || "").toLowerCase());

  for (const mapping of MODEL_TO_SLIDE) {
    for (const m of models) {
      if (m.includes(mapping.key)) {
        keep.add(mapping.slide);
      }
    }
  }

  const flags = opts.flags || {};
  const hasIdFace = models.some((m) => m.includes("idface"));
  const hasIdAccessNano = models.some((m) => m.includes("idaccess nano"));
  const hasIdFlexPro = models.some((m) => m.includes("idflex pro"));
  const hasCatraca = flags.hasCatraca === true || models.some((m) => m.includes("catraca") || m.includes("catraca"));

  if (hasIdFace && flags.botoeira && flags.idfaceEntry) keep.add(47);
  if (hasIdFace && flags.idfaceEntry && flags.idfaceExit) keep.add(48);
  if (hasIdAccessNano && flags.idAccessNanoEntry && flags.botoeira) keep.add(49);
  if (hasIdFlexPro && flags.idFlexProEntry && flags.botoeira) keep.add(51);
  if (hasIdFlexPro && (flags.idFlexProEntry && flags.idFlexProGlass)) keep.add(52);
  if (hasCatraca) keep.add(53);
  if ((models.length > 0) || flags.systemIncluded) keep.add(55);

  if (Array.isArray(opts.keepSlidesOverride) && opts.keepSlidesOverride.length > 0) {
    for (const n of opts.keepSlidesOverride) keep.add(n);
  }

  return keep;
}

/**
 * Read mapping from localStorage.
 * Expected shape: { [replacementKey]: "Exact source text in PPTX to replace" }
 * Example: { companyName: "Razão Social:", contactName: "Aos cuidados de:" }
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
 * Tokens format: {{tokenName}}
 * Also replaces plain mapped source strings (from localStorage) with values.
 *
 * Updated behavior:
 * - Handles tokens that are split across multiple <a:t> runs.
 * - Strategy: extract all <a:t> runs, concatenate their inner text, apply replacements to the concatenated text,
 *   then write the replaced text into the first run and clear subsequent runs (preserves structure and avoids breaking XML).
 *
 * Additional: logs debug snippets when localStorage.pptx_debug === "1".
 */
function applyReplacementsToXml(xml: string, replacements: Record<string, string | number>) {
  const debug = (typeof window !== "undefined" && localStorage.getItem("pptx_debug") === "1") || false;

  // If no runs exist, fall back to simple global string replacements
  const textNodeRegex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/gi;
  const runs: string[] = [];
  let match;
  while ((match = textNodeRegex.exec(xml)) !== null) {
    runs.push(match[1] ?? "");
  }

  // Helper to apply token and plain replacements to a string
  const applyReplacementsToString = (input: string) => {
    let out = input;

    // 1) Replace tokenized placeholders like {{companyName}}
    for (const [key, val] of Object.entries(replacements || {})) {
      const token = `{{${key}}}`;
      out = out.split(token).join(String(val ?? ""));
    }

    // 2) Replace plain-text mapped sources (if any)
    const plainMap = loadPlainMapping(); // e.g. { companyName: "Razão Social:" }
    for (const [replacementKey, sourceText] of Object.entries(plainMap)) {
      if (!sourceText) continue;
      const replacementValue = String(replacements[replacementKey] ?? "");
      out = out.split(sourceText).join(replacementValue);
    }

    return out;
  };

  if (runs.length > 0) {
    // Concatenate runs to reconstruct tokens split across runs
    const joined = runs.join("");
    if (debug) {
      try {
        console.debug("[pptx-template] slide-run-joined-snippet:", joined.slice(0, 300));
      } catch {}
    }

    const replacedJoined = applyReplacementsToString(joined);

    if (debug) {
      try {
        console.debug("[pptx-template] slide-run-replaced-snippet:", replacedJoined.slice(0, 300));
      } catch {}
    }

    // Rebuild XML: put replacedJoined into first <a:t> and clear the rest.
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

  // Fallback to the original simple replacements if no runs found (should rarely happen)
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
 * Blank textual content inside a slide (replace all <a:t>...</a:t> with empty string).
 * Keep a single empty <a:t></a:t>.
 */
function blankSlideXml(xml: string) {
  return xml.replace(/<a:t[\s\S]*?<\/a:t>/gi, "<a:t></a:t>");
}

/**
 * Attempt to fetch a PPTX template from a list of candidate URLs.
 * Validates that fetched content looks like a ZIP/PPTX by checking PK header bytes.
 * Returns an ArrayBuffer for the first valid candidate.
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

      // Validate start bytes for ZIP: 'PK' (0x50 0x4B)
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

  // Candidate URLs: try public path first (served at root), then bundled template path
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
    // If we cannot fetch any valid candidate, throw so fallback in caller can handle (or upstream catches and uses pptxgenjs fallback)
    console.error("[pptx-template] failed to fetch a valid template from candidates:", fetchErr);
    throw fetchErr;
  }

  const zip = await JSZip.loadAsync(arrayBuffer);

  const keepSlides = resolveKeepSlides(opts);

  const slideFiles = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  if (debug) {
    try {
      console.debug("[pptx-template] detected slide files:", slideFiles.length);
    } catch {}
  }

  for (const path of slideFiles) {
    const content = await zip.file(path)!.async("string");
    const match = path.match(/slide(\d+)\.xml$/);
    const slideNumber = match ? parseInt(match[1], 10) : NaN;

    if (debug) {
      try {
        console.debug(`[pptx-template] processing ${path} (slide ${String(slideNumber)}) - original length ${content.length}`);
      } catch {}
    }

    // Apply replacements (both tokens and mapped plain texts) using the improved function
    const replaced = applyReplacementsToXml(content, opts.replacements || {});

    if (debug) {
      try {
        // determine if any token replacement likely occurred by comparing small snippets
        const beforeSnippet = content.slice(0, 300);
        const afterSnippet = replaced.slice(0, 300);
        if (beforeSnippet !== afterSnippet) {
          console.debug(`[pptx-template] slide ${String(slideNumber)}: content changed after replacements (snippet diff):`, {
            before: beforeSnippet,
            after: afterSnippet,
          });
        } else {
          console.debug(`[pptx-template] slide ${String(slideNumber)}: no visible change in first 300 chars after replacements`);
        }
      } catch {}
    }

    if (Number.isNaN(slideNumber)) {
      zip.file(path, replaced);
      continue;
    }

    if (keepSlides.has(slideNumber)) {
      zip.file(path, replaced);
    } else {
      const blanked = blankSlideXml(replaced);
      zip.file(path, blanked);
    }
  }

  const newZipBlob = await zip.generateAsync({ type: "blob" });

  if (debug) {
    try {
      console.debug("[pptx-template] generated new pptx blob size:", (newZipBlob as Blob).size);
    } catch {}
  }

  return newZipBlob;
}
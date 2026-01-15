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
 * - Tokens found in the template as {{...}} are normalized (remove accents, non-alnum, lowercase)
 *   and matched against replacement keys so variants like {{Seller Name}} or {{seller_name}}
 *   will map to the same replacement key (e.g. sellerName). This fixes missing vendor fields.
 * - Substitutions are applied per <a:txBody> block and only to the matched spans, preserving other text and run formatting.
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

function normalizeKey(k?: string) {
  if (!k) return "";
  return String(k)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Build list of search patterns (tokens like {{key}} and plain mapped source texts).
 * Longer patterns are prioritized to avoid partial matches.
 */
function buildPatterns(replacements: Record<string, string | number>) {
  const patterns: Array<{ source: string; replacement: string }> = [];

  for (const [key, val] of Object.entries(replacements || {})) {
    const token = `{{${key}}}`;
    patterns.push({ source: token, replacement: String(val ?? "") });
    // also add underscored variant and spaced variant to catch common token forms
    const underscored = `{{${key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "")}}}`;
    patterns.push({ source: underscored, replacement: String(val ?? "") });
  }

  const plainMap = loadPlainMapping();
  for (const [replacementKey, sourceText] of Object.entries(plainMap)) {
    if (!sourceText) continue;
    const replacementValue = String(replacements[replacementKey] ?? "");
    patterns.push({ source: sourceText, replacement: replacementValue });
  }

  // sort by source length desc so longer matches are found first
  patterns.sort((a, b) => b.source.length - a.source.length);
  return patterns;
}

/**
 * Find all non-overlapping matches of any pattern in the full text.
 * Returns sorted list of {start,end,replacement,source}.
 */
function findMatchesInText(full: string, patterns: Array<{ source: string; replacement: string }>) {
  const matches: Array<{ start: number; end: number; replacement: string; source: string }> = [];

  // We'll scan left-to-right using indexOf for each pattern; to avoid overlapping conflicts,
  // after we collect candidates we'll sort and then filter overlaps by preferring earliest-start, longest-first.
  for (const p of patterns) {
    const s = p.source;
    if (!s) continue;
    let idx = full.indexOf(s);
    while (idx !== -1) {
      matches.push({ start: idx, end: idx + s.length, replacement: p.replacement, source: s });
      idx = full.indexOf(s, idx + 1);
    }
  }

  if (matches.length === 0) return [];

  // Sort by start asc, length desc (so longer patterns earlier for same start)
  matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  // Filter overlaps: keep a match if it doesn't overlap the previous kept one
  const filtered: typeof matches = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    } else {
      // overlapping: skip (we prefer earlier kept match)
      continue;
    }
  }

  return filtered;
}

/**
 * Find tokens of the form {{...}} inside a string and attempt to map them to replacement keys
 * using normalizeKey. Returns matches with start/end and replacement when a mapping is found.
 */
function findNormalizedTokenMatches(full: string, replacements: Record<string, string | number>) {
  const tokenRegex = /\{\{\s*([^}]+?)\s*\}\}/g;
  const matches: Array<{ start: number; end: number; replacement: string; source: string }> = [];
  const normalizedMap: Record<string, string> = {};
  for (const k of Object.keys(replacements || {})) {
    normalizedMap[normalizeKey(k)] = k;
  }
  let m;
  while ((m = tokenRegex.exec(full)) !== null) {
    const inner = String(m[1] || "");
    const norm = normalizeKey(inner);
    const mappedKey = normalizedMap[norm];
    if (mappedKey) {
      const replacement = String(replacements[mappedKey] ?? "");
      matches.push({ start: m.index, end: m.index + m[0].length, replacement, source: m[0] });
    }
  }
  return matches;
}

/**
 * Process a block of XML corresponding to a <a:txBody>...</a:txBody>.
 * This implementation:
 * - Extracts all <a:t> run texts (in order) and computes the full concatenated text.
 * - Finds token/source matches in full text and their replacements (including normalized {{...}} tokens).
 * - Reconstructs each run's new text by emitting original substrings outside matches and replacement strings where matches occur,
 *   preserving runs that are not touched and preserving run-level formatting.
 */
function processTxBodyBlock(blockContent: string, replacements: Record<string, string | number>, debug = false) {
  const textNodeRegex = /(<a:t[^>]*>)([\s\S]*?)(<\/a:t>)/gi;
  const runs: string[] = [];
  const runMatches: Array<{ openTag: string; inner: string; closeTag: string }> = [];
  let match;
  while ((match = textNodeRegex.exec(blockContent)) !== null) {
    runMatches.push({ openTag: match[1], inner: match[2] ?? "", closeTag: match[3] });
    runs.push(match[2] ?? "");
  }

  if (runs.length === 0) {
    return blockContent;
  }

  const full = runs.join("");
  if (debug) {
    try {
      console.debug("[pptx-template] txBody-full-text:", full.slice(0, 400));
    } catch {}
  }

  const patterns = buildPatterns(replacements);
  const patternMatches = findMatchesInText(full, patterns);
  const normalizedTokenMatches = findNormalizedTokenMatches(full, replacements);

  // Combine matches and dedupe by start/end (prefer patternMatches first)
  const combined = [...patternMatches, ...normalizedTokenMatches];
  if (combined.length === 0) return blockContent;

  // Sort and filter overlaps (earliest start, longest first)
  combined.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const filtered: typeof combined = [];
  let lastEnd = -1;
  for (const c of combined) {
    if (c.start >= lastEnd) {
      filtered.push(c);
      lastEnd = c.end;
    }
  }

  const matches = filtered;

  if (matches.length === 0) {
    return blockContent;
  }

  if (debug) {
    try {
      console.debug("[pptx-template] txBody-matches:", matches);
    } catch {}
  }

  // Now rebuild runs, iterating through runs and injecting replacements when match.start falls inside a run.
  const runOffsets: number[] = [];
  let acc = 0;
  for (const r of runs) {
    runOffsets.push(acc);
    acc += r.length;
  }

  let matchIndex = 0;
  const newRunTexts: string[] = [];

  for (let i = 0; i < runs.length; i++) {
    const runStart = runOffsets[i];
    const runEnd = runStart + runs[i].length;
    let cursor = runStart;
    let outPieces: string[] = [];

    // Advance matchIndex if matches are before current run
    while (matchIndex < matches.length && matches[matchIndex].end <= runStart) {
      matchIndex++;
    }

    let localMatchIdx = matchIndex;
    while (localMatchIdx < matches.length && matches[localMatchIdx].start < runEnd) {
      const m = matches[localMatchIdx];
      if (m.start >= runEnd) break;

      // Append original substring from cursor to match.start (but clipped to this run)
      if (m.start > cursor) {
        outPieces.push(full.slice(cursor, Math.min(m.start, runEnd)));
      }

      // If match starts within this run, emit replacement now (only once per match)
      if (m.start >= runStart && m.start < runEnd) {
        outPieces.push(m.replacement);
      } else if (m.start < runStart && m.end > runStart) {
        // Match started in previous run(s) and continues into this run.
        // Replacement should have been emitted in the run containing the start; just advance cursor.
      }

      // Advance cursor to max(cursor, m.end) but do not exceed runEnd
      cursor = Math.max(cursor, Math.min(m.end, runEnd));

      localMatchIdx++;
    }

    // After processing matches that overlap this run, append any remaining original text from cursor to runEnd
    if (cursor < runEnd) {
      outPieces.push(full.slice(cursor, runEnd));
    }

    // Ensure global matchIndex keeps up
    while (matchIndex < matches.length && matches[matchIndex].end <= runEnd) {
      matchIndex++;
    }

    const newRunText = outPieces.join("");
    newRunTexts.push(newRunText);
  }

  // Reconstruct blockContent by replacing each <a:t> inner string sequentially with newRunTexts
  let replaceCounter = 0;
  const rebuilt = blockContent.replace(textNodeRegex, (_full, openTag, inner, closeTag) => {
    const newInner = typeof newRunTexts[replaceCounter] === "string" ? newRunTexts[replaceCounter] : "";
    replaceCounter++;
    return openTag + newInner + closeTag;
  });

  return rebuilt;
}

/**
 * Fallback simple global replacements across XML (no run consolidation),
 * to catch tokens outside <a:txBody> blocks.
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

    // Apply per-txBody processing to preserve shapes and run formatting.
    const txBodyRegex = /(<a:txBody[^>]*>)([\s\S]*?)(<\/a:txBody>)/gi;
    let modifiedContent = content;
    let anyTxBodyMatched = false;

    modifiedContent = modifiedContent.replace(txBodyRegex, (fullMatch, openTag, body, closeTag) => {
      anyTxBodyMatched = true;
      const processedBody = processTxBodyBlock(body, opts.replacements || {}, debug);
      return openTag + processedBody + closeTag;
    });

    // If no txBody matched, fallback to run-consolidation processing for whole slide
    if (!anyTxBodyMatched) {
      const processed = processTxBodyBlock(modifiedContent, opts.replacements || {}, debug);
      modifiedContent = processed;
    }

    // Global replacements as final catch-all (for tokens outside txBody)
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
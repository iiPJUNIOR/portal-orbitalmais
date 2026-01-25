"use client";

import JSZip from "jszip";

/**
 * PPTX template processor with slide pruning support.
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

function buildPatterns(replacements: Record<string, string | number>) {
  const patterns: Array<{ source: string; replacement: string }> = [];

  for (const [key, val] of Object.entries(replacements || {})) {
    const token = `{{${key}}}`;
    patterns.push({ source: token, replacement: String(val ?? "") });
    const underscored = `{{${key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "")}}}`;
    patterns.push({ source: underscored, replacement: String(val ?? "") });
  }

  const plainMap = loadPlainMapping();
  for (const [replacementKey, sourceText] of Object.entries(plainMap)) {
    if (!sourceText) continue;
    const replacementValue = String(replacements[replacementKey] ?? "");
    patterns.push({ source: sourceText, replacement: replacementValue });
  }

  patterns.sort((a, b) => b.source.length - a.source.length);
  return patterns;
}

function findMatchesInText(full: string, patterns: Array<{ source: string; replacement: string }>) {
  const matches: Array<{ start: number; end: number; replacement: string; source: string }> = [];
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
  matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const filtered: typeof matches = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }
  return filtered;
}

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

function processTxBodyBlock(blockContent: string, replacements: Record<string, string | number>) {
  const textNodeRegex = /(<a:t[^>]*>)([\s\S]*?)(<\/a:t>)/gi;
  const runs: string[] = [];
  let match;
  while ((match = textNodeRegex.exec(blockContent)) !== null) {
    runs.push(match[2] ?? "");
  }
  if (runs.length === 0) return blockContent;

  const full = runs.join("");
  const patterns = buildPatterns(replacements);
  const patternMatches = findMatchesInText(full, patterns);
  const normalizedTokenMatches = findNormalizedTokenMatches(full, replacements);

  const combined = [...patternMatches, ...normalizedTokenMatches];
  if (combined.length === 0) return blockContent;

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
  if (matches.length === 0) return blockContent;

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

    while (matchIndex < matches.length && matches[matchIndex].end <= runStart) {
      matchIndex++;
    }

    let localMatchIdx = matchIndex;
    while (localMatchIdx < matches.length && matches[localMatchIdx].start < runEnd) {
      const m = matches[localMatchIdx];
      if (m.start >= runEnd) break;
      if (m.start > cursor) {
        outPieces.push(full.slice(cursor, Math.min(m.start, runEnd)));
      }
      if (m.start >= runStart && m.start < runEnd) {
        outPieces.push(m.replacement);
      }
      cursor = Math.max(cursor, Math.min(m.end, runEnd));
      localMatchIdx++;
    }
    if (cursor < runEnd) {
      outPieces.push(full.slice(cursor, runEnd));
    }
    while (matchIndex < matches.length && matches[matchIndex].end <= runEnd) {
      matchIndex++;
    }
    newRunTexts.push(outPieces.join(""));
  }

  let replaceCounter = 0;
  return blockContent.replace(textNodeRegex, (_full, openTag, inner, closeTag) => {
    const newInner = typeof newRunTexts[replaceCounter] === "string" ? newRunTexts[replaceCounter] : "";
    replaceCounter++;
    return openTag + newInner + closeTag;
  });
}

function applyGlobalStringReplacements(xml: string, replacements: Record<string, string | number>) {
  let out = xml;
  for (const [key, val] of Object.entries(replacements || {})) {
    out = out.split(`{{${key}}}`).join(String(val ?? ""));
  }
  const plainMap = loadPlainMapping();
  for (const [replacementKey, sourceText] of Object.entries(plainMap)) {
    if (!sourceText) continue;
    out = out.split(sourceText).join(String(replacements[replacementKey] ?? ""));
  }
  return out;
}

async function fetchTemplateArrayBufferFromCandidates(candidateUrls: string[]) {
  for (const url of candidateUrls) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const buffer = await resp.arrayBuffer();
      const view = new Uint8Array(buffer.slice(0, 4));
      if (view[0] === 0x50 && view[1] === 0x4b) return buffer;
    } catch {
      continue;
    }
  }
  throw new Error("Unable to fetch a valid PPTX template.");
}

/**
 * Prunes slides from the PPTX to keep only specified slide numbers.
 */
async function pruneSlides(zip: JSZip, keepSlideNumbers: number[]) {
  const presXmlPath = "ppt/presentation.xml";
  const presRelsPath = "ppt/_rels/presentation.xml.rels";
  
  let presXml = await zip.file(presXmlPath)!.async("string");
  let presRels = await zip.file(presRelsPath)!.async("string");

  const sldIdRegex = /<p:sldId [^>]*?r:id="(rId\d+)"[^>]*?\/>/g;
  const relRegex = /<Relationship [^>]*?Id="(rId\d+)"[^>]*?Target="slides\/slide(\d+)\.xml"[^>]*?\/>/g;

  const relsToKeep: string[] = [];
  const slidesToDelete: number[] = [];
  
  // First, find which rIds correspond to which slide numbers in the rels
  const relIdToSlideNum: Record<string, number> = {};
  let relMatch;
  while ((relMatch = relRegex.exec(presRels)) !== null) {
    const rId = relMatch[1];
    const sldNum = parseInt(relMatch[2], 10);
    relIdToSlideNum[rId] = sldNum;
    if (keepSlideNumbers.includes(sldNum)) {
      relsToKeep.push(rId);
    } else {
      slidesToDelete.push(sldNum);
    }
  }

  // Remove non-kept slide references from presentation.xml
  presXml = presXml.replace(/<p:sldId [^>]*?\/>/g, (tag) => {
    const m = /r:id="(rId\d+)"/.exec(tag);
    if (m && relsToKeep.includes(m[1])) return tag;
    return "";
  });

  // Remove non-kept relationships from presentation.xml.rels
  presRels = presRels.replace(/<Relationship [^>]*?\/>/g, (tag) => {
    const m = /Id="(rId\d+)"/.exec(tag);
    const mTarget = /Target="slides\/slide(\d+)\.xml"/.exec(tag);
    if (m && mTarget) {
      if (relsToKeep.includes(m[1])) return tag;
      return "";
    }
    return tag; // Keep other types of rels (themes, etc)
  });

  // Physically delete slide files
  for (const num of slidesToDelete) {
    zip.remove(`ppt/slides/slide${num}.xml`);
    zip.remove(`ppt/slides/_rels/slide${num}.xml.rels`);
  }

  zip.file(presXmlPath, presXml);
  zip.file(presRelsPath, presRels);
}

export async function generatePptxFromTemplate(opts: PptxGenerateOptions): Promise<Blob> {
  const candidateUrls: string[] = ["/proposal-template.pptx"];
  try {
    const modUrl = new URL("../templates/proposal-template.pptx", import.meta.url).href;
    candidateUrls.push(modUrl);
  } catch {}

  const arrayBuffer = await fetchTemplateArrayBufferFromCandidates(candidateUrls);
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Pruning logic if keepSlidesOverride is provided
  if (opts.keepSlidesOverride && opts.keepSlidesOverride.length > 0) {
    await pruneSlides(zip, opts.keepSlidesOverride);
  }

  const slideFiles = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  for (const path of slideFiles) {
    const content = await zip.file(path)!.async("string");
    const txBodyRegex = /(<a:txBody[^>]*>)([\s\S]*?)(<\/a:txBody>)/gi;
    let modifiedContent = content.replace(txBodyRegex, (fm, ot, body, ct) => {
      return ot + processTxBodyBlock(body, opts.replacements) + ct;
    });
    modifiedContent = applyGlobalStringReplacements(modifiedContent, opts.replacements);
    zip.file(path, modifiedContent);
  }

  return await zip.generateAsync({ type: "blob" });
}
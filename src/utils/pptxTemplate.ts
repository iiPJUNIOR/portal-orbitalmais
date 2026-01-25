"use client";

import JSZip from "jszip";

/**
 * PPTX template processor with slide pruning support and robust token replacement.
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
    return {};
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
 * Replaces tokens in the provided XML string.
 * This handles both standard {{token}} and custom mappings.
 */
function applyGlobalStringReplacements(xml: string, replacements: Record<string, string | number>) {
  let out = xml;
  
  // 1. Prioritize exact matches for items_list tokens as they are critical for Page 3
  const criticalTokens = ["items_list", "items_list1", "items_list2"];
  criticalTokens.forEach(token => {
    const val = String(replacements[token] || "");
    out = out.split(`{{${token}}}`).join(val);
  });

  // 2. Apply all other replacements
  for (const [key, val] of Object.entries(replacements || {})) {
    if (criticalTokens.includes(key)) continue;
    out = out.split(`{{${key}}}`).join(String(val ?? ""));
  }

  // 3. Apply manual mappings from TokenScanner
  const plainMap = loadPlainMapping();
  for (const [replacementKey, sourceText] of Object.entries(plainMap)) {
    if (!sourceText) continue;
    out = out.split(sourceText).join(String(replacements[replacementKey] ?? ""));
  }

  return out;
}

/**
 * Deeply processes <a:t> nodes to handle tokens split across multiple runs.
 */
function processTxBodyBlock(blockContent: string, replacements: Record<string, string | number>) {
  const textNodeRegex = /(<a:t[^>]*>)([\s\S]*?)(<\/a:t>)/gi;
  const runs: { full: string; open: string; text: string; close: string }[] = [];
  
  let match;
  while ((match = textNodeRegex.exec(blockContent)) !== null) {
    runs.push({ full: match[0], open: match[1], text: match[2], close: match[3] });
  }
  
  if (runs.length === 0) return blockContent;

  const fullText = runs.map(r => r.text).join("");
  let modifiedFullText = fullText;

  // Replace all available tokens in the concatenated text
  for (const [key, val] of Object.entries(replacements)) {
    const token = `{{${key}}}`;
    if (modifiedFullText.includes(token)) {
      modifiedFullText = modifiedFullText.split(token).join(String(val ?? ""));
    }
  }

  // If text changed, we need to distribute it back. 
  // Simplest way for Page 3 is to put the new text in the first run and clear others 
  // if the token was split. This prevents duplication.
  if (modifiedFullText !== fullText) {
    let result = blockContent;
    // We replace the first run with our processed full text and empty out the rest 
    // to avoid the original text parts sticking around.
    let first = true;
    return blockContent.replace(textNodeRegex, () => {
      if (first) {
        first = false;
        return runs[0].open + modifiedFullText + runs[0].close;
      }
      return runs[0].open + "" + runs[0].close;
    });
  }

  return blockContent;
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
  throw new Error("Não foi possível carregar o template PPTX.");
}

async function pruneSlides(zip: JSZip, keepSlideNumbers: number[]) {
  const presXmlPath = "ppt/presentation.xml";
  const presRelsPath = "ppt/_rels/presentation.xml.rels";
  
  let presXml = await zip.file(presXmlPath)!.async("string");
  let presRels = await zip.file(presRelsPath)!.async("string");

  const relIdToSlideNum: Record<string, number> = {};
  const relRegex = /<Relationship [^>]*?Id="(rId\d+)"[^>]*?Target="slides\/slide(\d+)\.xml"[^>]*?\/>/g;
  
  let relMatch;
  const relsToKeep: string[] = [];
  const slidesToDelete: number[] = [];

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

  presXml = presXml.replace(/<p:sldId [^>]*?\/>/g, (tag) => {
    const m = /r:id="(rId\d+)"/.exec(tag);
    if (m && relsToKeep.includes(m[1])) return tag;
    return "";
  });

  presRels = presRels.replace(/<Relationship [^>]*?\/>/g, (tag) => {
    const mId = /Id="(rId\d+)"/.exec(tag);
    const mTarget = /Target="slides\/slide(\d+)\.xml"/.exec(tag);
    if (mId && mTarget) {
      if (relsToKeep.includes(mId[1])) return tag;
      return "";
    }
    return tag;
  });

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

  if (opts.keepSlidesOverride && opts.keepSlidesOverride.length > 0) {
    await pruneSlides(zip, opts.keepSlidesOverride);
  }

  const slideFiles = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  for (const path of slideFiles) {
    const content = await zip.file(path)!.async("string");
    
    // First, process txBody blocks which are more granular
    const txBodyRegex = /(<a:txBody[^>]*>)([\s\S]*?)(<\/a:txBody>)/gi;
    let modifiedContent = content.replace(txBodyRegex, (fm, ot, body, ct) => {
      return ot + processTxBodyBlock(body, opts.replacements) + ct;
    });
    
    // Then apply global replacements for any remaining tokens
    modifiedContent = applyGlobalStringReplacements(modifiedContent, opts.replacements);
    zip.file(path, modifiedContent);
  }

  return await zip.generateAsync({ type: "blob" });
}
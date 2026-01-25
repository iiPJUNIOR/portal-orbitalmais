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

/**
 * Replaces tokens in the provided XML string with a more aggressive approach.
 */
function applyGlobalStringReplacements(xml: string, replacements: Record<string, string | number>) {
  let out = xml;
  
  // 1. Apply replacements from the main object
  for (const [key, val] of Object.entries(replacements || {})) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Regex matches {{key}}, {{ key }}, {{  key  }}, etc. Case insensitive.
    const regex = new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'gi');
    out = out.replace(regex, String(val ?? ""));
    
    // Fallback for common synonyms if the user uses a different token in the template
    if (key === 'companyName') {
      out = out.replace(/{{\s*(razaoSocial|razãoSocial|empresa)\s*}}/gi, String(val ?? ""));
    }
  }

  // 2. Apply manual mappings from TokenScanner
  const plainMap = loadPlainMapping();
  for (const [replacementKey, sourceText] of Object.entries(plainMap)) {
    if (!sourceText) continue;
    const val = String(replacements[replacementKey] ?? "");
    // sourceText is exactly what was found in the scanner (e.g. "{{companyName}}")
    out = out.split(sourceText).join(val);
  }

  return out;
}

/**
 * Deeply processes <a:t> nodes to handle tokens split across multiple runs.
 * PowerPoint often splits text like {{companyName}} into <a:t>{{</a:t><a:t>companyName</a:t><a:t>}}</a:t>
 */
function processTxBodyBlock(blockContent: string, replacements: Record<string, string | number>) {
  const textNodeRegex = /(<a:t[^>]*>)([\s\S]*?)(<\/a:t>)/gi;
  const runs: { full: string; open: string; text: string; close: string }[] = [];
  
  let match;
  while ((match = textNodeRegex.exec(blockContent)) !== null) {
    runs.push({ 
      full: match[0], 
      open: match[1], 
      text: match[2], 
      close: match[3] 
    });
  }
  
  if (runs.length === 0) return blockContent;

  const fullText = runs.map(r => r.text).join("");
  let modifiedFullText = fullText;

  // Replace all available tokens in the concatenated text using regex
  for (const [key, val] of Object.entries(replacements)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'gi');
    modifiedFullText = modifiedFullText.replace(regex, String(val ?? ""));
    
    // Add common synonyms here too for robustness
    if (key === 'companyName') {
      modifiedFullText = modifiedFullText.replace(/{{\s*(razaoSocial|razãoSocial|empresa)\s*}}/gi, String(val ?? ""));
    }
  }

  // If we changed anything, we clear the other runs and put everything in the first one
  // to maintain style as much as possible without breaking the logic.
  if (modifiedFullText !== fullText) {
    let replaced = false;
    return blockContent.replace(textNodeRegex, (full, open, text, close) => {
      if (!replaced) {
        replaced = true;
        return open + modifiedFullText + close;
      }
      return open + "" + close;
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
    
    // First pass: handle split tokens within text bodies
    const txBodyRegex = /(<a:txBody[^>]*>)([\s\S]*?)(<\/a:txBody>)/gi;
    let modifiedContent = content.replace(txBodyRegex, (fm, ot, body, ct) => {
      return ot + processTxBodyBlock(body, opts.replacements) + ct;
    });
    
    // Second pass: handle any global replacements (non-split or outside txBody)
    modifiedContent = applyGlobalStringReplacements(modifiedContent, opts.replacements);
    zip.file(path, modifiedContent);
  }

  return await zip.generateAsync({ type: "blob" });
}
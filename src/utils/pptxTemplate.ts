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
 * PowerPoint often splits tokens with XML tags like:
 * {{<a:t>companyName</a:t>}}
 * This function "heals" these split tokens by finding the pattern and merging them
 * into a single clean text run before replacement.
 */
function healTokensInXml(xml: string): string {
  // 1. First, handle the most common case: tokens split across multiple <a:t> nodes
  // This finds paragraphs <a:p> and tries to simplify their runs
  const paragraphRegex = /<a:p>([\s\S]*?)<\/a:p>/gi;
  
  return xml.replace(paragraphRegex, (pMatch, pContent) => {
    // Extract all text content from <a:t> tags within this paragraph
    const textNodeRegex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/gi;
    const runs: string[] = [];
    let match;
    while ((match = textNodeRegex.exec(pContent)) !== null) {
      runs.push(match[1]);
    }

    const fullText = runs.join("");
    // If there's no potential token, don't touch it
    if (!fullText.includes("{{")) return pMatch;

    // If we find a token, we rebuild the first <a:t> with the full content
    // and empty out the others to maintain structure but allow regex to work
    let replaced = false;
    const healedContent = pContent.replace(textNodeRegex, (tFull, tOpen, tClose) => {
      if (!replaced) {
        replaced = true;
        // Inject the full concatenated text into the first node
        return tOpen.replace(/>([\s\S]*)$/, `>${fullText}`);
      }
      // Empty subsequent nodes
      return tOpen.replace(/>([\s\S]*)$/, `>`);
    });

    return `<a:p>${healedContent}</a:p>`;
  });
}

function applyGlobalStringReplacements(xml: string, replacements: Record<string, string | number>) {
  let out = xml;
  
  // 1. Heal split tokens first
  out = healTokensInXml(out);

  // 2. Apply main replacements
  for (const [key, val] of Object.entries(replacements || {})) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'gi');
    out = out.replace(regex, String(val ?? ""));
  }

  // 3. Apply manual mappings from TokenScanner
  const plainMap = loadPlainMapping();
  for (const [replacementKey, sourceText] of Object.entries(plainMap)) {
    if (!sourceText) continue;
    const val = String(replacements[replacementKey] ?? "");
    // Use split/join for fixed string replacement
    out = out.split(sourceText).join(val);
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
    const modifiedContent = applyGlobalStringReplacements(content, opts.replacements);
    zip.file(path, modifiedContent);
  }

  return await zip.generateAsync({ type: "blob" });
}
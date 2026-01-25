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
 * This function safely "heals" these split tokens by concatenating text runs
 * within a paragraph without breaking the XML tag structure.
 */
function healTokensInXml(xml: string): string {
  const paragraphRegex = /<a:p>([\s\S]*?)<\/a:p>/gi;
  
  return xml.replace(paragraphRegex, (pMatch, pContent) => {
    const textNodeRegex = /(<a:t[^>]*>)([\s\S]*?)(<\/a:t>)/gi;
    const runs: { open: string; text: string; close: string }[] = [];
    
    let match;
    while ((match = textNodeRegex.exec(pContent)) !== null) {
      runs.push({ open: match[1], text: match[2], close: match[3] });
    }

    if (runs.length === 0) return pMatch;

    const fullText = runs.map(r => r.text).join("");
    if (!fullText.includes("{{") && !fullText.includes("}}")) return pMatch;

    let runIndex = 0;
    const healedContent = pContent.replace(textNodeRegex, () => {
      const r = runs[runIndex++];
      if (runIndex === 1) {
        return r.open + fullText + r.close;
      }
      return r.open + r.close;
    });

    return `<a:p>${healedContent}</a:p>`;
  });
}

function applyGlobalStringReplacements(xml: string, replacements: Record<string, string | number>) {
  let out = xml;
  
  // 1. Cura os tokens fragmentados
  out = healTokensInXml(out);

  // 2. Aplica as substituições principais
  for (const [key, val] of Object.entries(replacements || {})) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'gi');
    out = out.replace(regex, String(val ?? ""));
  }

  // 3. Aplica os mapeamentos manuais
  const plainMap = loadPlainMapping();
  for (const [replacementKey, sourceText] of Object.entries(plainMap)) {
    if (!sourceText) continue;
    const val = String(replacements[replacementKey] ?? "");
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

  // 1. Processa os arquivos de slide (.xml) para substituir textos
  const slideFiles = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  for (const path of slideFiles) {
    const content = await zip.file(path)!.async("string");
    const modifiedContent = applyGlobalStringReplacements(content, opts.replacements);
    zip.file(path, modifiedContent);
  }

  // 2. Processa os arquivos de relacionamento (.rels) para substituir links (hyperlinks)
  const relsFiles = Object.keys(zip.files).filter((p) => /ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(p));
  for (const path of relsFiles) {
    let content = await zip.file(path)!.async("string");
    
    if (opts.replacements.approvalLink) {
      const link = String(opts.replacements.approvalLink);
      
      // Substituição robusta considerando que o PowerPoint pode codificar as chaves
      // Tenta as variações: {{approvalLink}}, %7B%7BapprovalLink%7D%7D e %7b%7bapprovalLink%7d%7d
      content = content.split('{{approvalLink}}').join(link);
      content = content.split('%7B%7BapprovalLink%7D%7D').join(link);
      content = content.split('%7b%7bapprovalLink%7d%7d').join(link);
      
      // Fallback para placeholder estático
      content = content.split('https://LINK_DA_PROPOSTA_PLACEHOLDER').join(link);
    }

    zip.file(path, content);
  }

  return await zip.generateAsync({ type: "blob" });
}
"use client";

import JSZip from "jszip";

/**
 * PPTX template processor.
 * - Loads template PPTX (must be present at src/templates/proposal-template.pptx).
 * - Replaces tokens in the form {{token}} across all slide XMLs.
 * - Also replaces exact source strings mapped in localStorage under 'pptx_token_map'.
 * - Blanks slides that are not in the keepSlides set.
 * - Returns a Blob (.pptx) ready for upload/download.
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
 */
function applyReplacementsToXml(xml: string, replacements: Record<string, string | number>) {
  let out = xml;

  // 1) Replace tokenized placeholders like {{companyName}}
  for (const [key, val] of Object.entries(replacements || {})) {
    const token = `{{${key}}}`;
    out = out.split(token).join(String(val ?? ""));
  }

  // 2) Replace plain-text mapped sources (if any)
  const plainMap = loadPlainMapping(); // e.g. { companyName: "Razão Social:" }
  // We want to replace occurrences of the mapped source with the target replacement value
  for (const [replacementKey, sourceText] of Object.entries(plainMap)) {
    if (!sourceText) continue;
    const replacementValue = String(replacements[replacementKey] ?? "");
    // Replace all occurrences of sourceText in the slide xml
    // Use simple split/join to avoid regexp escaping issues
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

export async function generatePptxFromTemplate(opts: PptxGenerateOptions): Promise<Blob> {
  const templateUrl = new URL("../templates/proposal-template.pptx", import.meta.url).href;
  const resp = await fetch(templateUrl);
  if (!resp.ok) {
    throw new Error("Failed to fetch PPTX template at " + templateUrl);
  }

  const arrayBuffer = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const keepSlides = resolveKeepSlides(opts);

  const slideFiles = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  for (const path of slideFiles) {
    const content = await zip.file(path)!.async("string");
    const match = path.match(/slide(\d+)\.xml$/);
    const slideNumber = match ? parseInt(match[1], 10) : NaN;

    // Apply replacements (both tokens and mapped plain texts)
    const replaced = applyReplacementsToXml(content, opts.replacements || {});

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
  return newZipBlob;
}
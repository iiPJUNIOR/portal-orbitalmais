"use client";

import JSZip from "jszip";

/**
 * Simple PPTX template processor.
 *
 * - Loads template PPTX (must be present at src/templates/proposal-template.pptx).
 * - Replaces tokens in the form {{token}} across all slide XMLs.
 * - Blanks slides that are not in the keepSlides set (we blank by removing text nodes).
 * - Returns a Blob (.pptx) ready for upload/download.
 *
 * Notes/limitations:
 * - This implementation performs text-level replacements inside slide XML files.
 * - It blanks slides not kept (instead of removing them from presentation.xml) to keep manipulation simpler and robust.
 * - Placeholders must be present as contiguous text in a single <a:t> element (best practice: use single token per text box).
 */

export interface PptxGenerateOptions {
  replacements: Record<string, string | number>;
  // modelNames from the quote items (used to include specific slides)
  modelNames?: string[];
  // global flags (from ProposalForm)
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
  // slide numbers forced to keep (1-based)
  keepSlidesOverride?: number[] | null;
}

/**
 * Map model name (lowercased) snippets to slide numbers (as provided).
 * Use substrings for matching to be resilient to small naming differences.
 */
const MODEL_TO_SLIDE: Array<{ key: string; slide: number }> = [
  { key: "idface pro", slide: 19 },
  { key: "idface max", slide: 20 },
  { key: "idflex ip65", slide: 22 },
  { key: "idaccess nano", slide: 21 },
  { key: "idflex pro", slide: 23 },
  { key: "idaccess", slide: 24 }, // careful: generic - prefer exact 'iDAccess' matches
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
  // add more mappings if needed
];

/**
 * Determine which slides to keep based on models + flags.
 * Basic rules implemented from user's mapping:
 * - Keep slides 1..18 and slide 46 always
 * - Keep slides 19..45 based on model matches
 * - Conditional slides 47/48/49/51/52/53/55 are included based on flags and presence of relevant models
 */
function resolveKeepSlides(opts: PptxGenerateOptions): Set<number> {
  const keep = new Set<number>();

  // always keep slides 1..18
  for (let i = 1; i <= 18; i++) keep.add(i);
  // slide 46 always
  keep.add(46);

  // slides 5..18 "devem ir em todos slides" — they are already included above.

  const models = (opts.modelNames || []).map((m) => (m || "").toLowerCase());

  // include specific slides by model mapping
  for (const mapping of MODEL_TO_SLIDE) {
    for (const m of models) {
      if (m.includes(mapping.key)) {
        keep.add(mapping.slide);
      }
    }
  }

  // also include slides 19..45 if any model triggers them (already done)
  // Conditional slides (47/48/49/51/52/53/55) heuristic:
  const flags = opts.flags || {};
  const hasIdFace = models.some((m) => m.includes("idface"));
  const hasIdAccessNano = models.some((m) => m.includes("idaccess nano"));
  const hasIdFlexPro = models.some((m) => m.includes("idflex pro"));
  const hasCatraca = flags.hasCatraca === true || models.some((m) => m.includes("catraca") || m.includes("catraca"));

  // 47: appear só quando a proposta é com idface para entrar e botoeira para sair
  if (hasIdFace && flags.botoeira && flags.idfaceEntry) {
    keep.add(47);
  }

  // 48: aparece quando é idface para entrar e para sair
  if (hasIdFace && flags.idfaceEntry && flags.idfaceExit) {
    keep.add(48);
  }

  // 49: aparece quando o iDAccess Nano é para entrar e botoeira para sair
  if (hasIdAccessNano && flags.idAccessNanoEntry && flags.botoeira) {
    keep.add(49);
  }

  // 51: somente quando iDFlex PRO IP65 for para entrar e botoeira para sair
  if (hasIdFlexPro && flags.idFlexProEntry && flags.botoeira) {
    keep.add(51);
  }

  // 52: somente quando for iDFlex PRO IP65 ou iDFlex PRO em portas de vidro
  if (hasIdFlexPro && (flags.idFlexProEntry && flags.idFlexProGlass)) {
    keep.add(52);
  }

  // 53: aparecer quando tiver catraca no projeto
  if (hasCatraca) {
    keep.add(53);
  }

  // 55: special: will keep slide 55 if there are items (we'll rely on caller to supply items presence)
  // We'll add 55 if there is any model or if systemIncluded flag is set
  if ((models.length > 0) || flags.systemIncluded) {
    keep.add(55);
  }

  // allow explicit override
  if (Array.isArray(opts.keepSlidesOverride) && opts.keepSlidesOverride.length > 0) {
    for (const n of opts.keepSlidesOverride) keep.add(n);
  }

  return keep;
}

/**
 * Replace tokens in slide XML content.
 * Tokens format: {{tokenName}}
 */
function applyReplacementsToXml(xml: string, replacements: Record<string, string | number>) {
  let out = xml;
  for (const [key, val] of Object.entries(replacements || {})) {
    const token = `{{${key}}}`;
    // replace all occurrences
    out = out.split(token).join(String(val ?? ""));
  }
  return out;
}

/**
 * Blank textual content inside a slide (replace all <a:t>...</a:t> with empty string).
 * We keep a single zero-width space so the slide is not treated as completely empty by some PPTX viewers.
 */
function blankSlideXml(xml: string) {
  return xml.replace(/<a:t[\s\S]*?<\/a:t>/gi, "<a:t></a:t>");
}

/**
 * Main generation function.
 */
export async function generatePptxFromTemplate(opts: PptxGenerateOptions): Promise<Blob> {
  // Build template URL relative to this file
  const templateUrl = new URL("../templates/proposal-template.pptx", import.meta.url).href;

  const resp = await fetch(templateUrl);
  if (!resp.ok) {
    throw new Error("Failed to fetch PPTX template at " + templateUrl + " — ensure file exists at src/templates/proposal-template.pptx");
  }

  const arrayBuffer = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Determine slides to keep
  const keepSlides = resolveKeepSlides(opts);

  // Iterate slide files in ppt/slides/slideN.xml
  const slideFiles = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  for (const path of slideFiles) {
    const content = await zip.file(path)!.async("string");
    // determine slide number from filename
    const match = path.match(/slide(\d+)\.xml$/);
    const slideNumber = match ? parseInt(match[1], 10) : NaN;

    // First apply replacements always (capa in all slides)
    const replaced = applyReplacementsToXml(content, opts.replacements || {});

    if (Number.isNaN(slideNumber)) {
      // save replaced content anyway
      zip.file(path, replaced);
      continue;
    }

    // If slideNumber is kept, keep replaced content
    if (keepSlides.has(slideNumber)) {
      zip.file(path, replaced);
    } else {
      // blank slide content
      const blanked = blankSlideXml(replaced);
      zip.file(path, blanked);
    }
  }

  // Return new pptx blob
  const newZipBlob = await zip.generateAsync({ type: "blob" });
  return newZipBlob;
}
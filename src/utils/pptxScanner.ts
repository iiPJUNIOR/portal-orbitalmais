"use client";

import JSZip from "jszip";

/**
 * Scans the PPTX template and returns a list of unique text fragments found in slide <a:t> nodes,
 * along with occurrence counts. This helps mapping template text to replacement keys.
 */
export async function scanTemplateTexts(): Promise<Array<{ text: string; count: number }>> {
  const templateUrl = new URL("../templates/proposal-template.pptx", import.meta.url).href;
  const resp = await fetch(templateUrl);
  if (!resp.ok) {
    throw new Error("Failed to fetch PPTX template at " + templateUrl);
  }

  const arrayBuffer = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const slideFiles = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  const counts: Record<string, number> = {};

  for (const path of slideFiles) {
    const content = await zip.file(path)!.async("string");
    // extract text nodes <a:t>...</a:t>
    const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/gi;
    let m;
    while ((m = re.exec(content)) !== null) {
      const t = (m[1] || "").trim();
      if (!t) continue;
      counts[t] = (counts[t] || 0) + 1;
    }
  }

  // convert to array sorted by count desc and length desc
  const arr = Object.entries(counts).map(([text, count]) => ({ text, count }));
  arr.sort((a, b) => b.count - a.count || b.text.length - a.text.length);
  return arr;
}
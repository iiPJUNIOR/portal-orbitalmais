"use client";

import JSZip from "jszip";

/**
 * Scans the PPTX template and returns a list of unique text fragments found in slide <a:t> nodes,
 * along with occurrence counts. This helps mapping template text to replacement keys.
 *
 * This version tries both the src-relative template and a public root fallback (/proposal-template.pptx)
 * and provides clearer error messages when the file is missing or not a ZIP.
 */

async function fetchTemplateArrayBuffer(): Promise<ArrayBuffer> {
  const candidateUrls: string[] = [];

  try {
    const modUrl = new URL("../templates/proposal-template.pptx", import.meta.url).href;
    candidateUrls.push(modUrl);
  } catch {
    // ignore
  }

  candidateUrls.push("/proposal-template.pptx");

  let lastErr: any = null;

  for (const url of candidateUrls) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        lastErr = new Error(`Template fetch failed (${resp.status} ${resp.statusText}) for ${url}`);
        console.warn("pptx-scanner: fetch not ok", { url, status: resp.status });
        continue;
      }

      const ct = resp.headers.get("content-type") || "";
      const isHtml = ct.includes("text/html") || ct.includes("application/xhtml+xml");

      const buffer = await resp.arrayBuffer();

      // Validate start bytes for ZIP: 'PK' (0x50 0x4B)
      const view = new Uint8Array(buffer.slice(0, 4));
      const startsWithPK = view[0] === 0x50 && view[1] === 0x4b;

      if (isHtml || !startsWithPK) {
        lastErr = new Error(
          `Fetched resource at ${url} does not look like a PPTX/ZIP (content-type: ${ct}, startsWithPK: ${startsWithPK}).`
        );
        console.warn("pptx-scanner: invalid file fetched", { url, contentType: ct, startsWithPK });
        continue;
      }

      return buffer;
    } catch (err) {
      lastErr = err;
      console.warn("pptx-scanner: fetch attempt failed", { url, err });
      continue;
    }
  }

  throw new Error(
    `Unable to load PPTX template. Tried: ${candidateUrls.join(", ")}. Last error: ${String(
      lastErr?.message || lastErr
    )}. Ensure the file exists as a binary PPTX at src/templates/proposal-template.pptx (and you rebuilt), or place it in public/proposal-template.pptx.`
  );
}

export async function scanTemplateTexts(): Promise<Array<{ text: string; count: number }>> {
  const arrayBuffer = await fetchTemplateArrayBuffer();
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

  const arr = Object.entries(counts).map(([text, count]) => ({ text, count }));
  arr.sort((a, b) => b.count - a.count || b.text.length - a.text.length);
  return arr;
}
"use client";

import JSZip from "jszip";

/**
 * Scans a DOCX template (word/document.xml) for tokens in the form {{tokenName}}.
 * Handles tokens split across multiple <w:t> nodes by joining them.
 * Tries the user-configured template URL from settings first, then falls back to the default.
 */
export async function scanDocxTemplate(url?: string): Promise<string[]> {
  // Resolve the URL to use: explicit arg → settings pptx_template_url → default
  let targetUrl = url;
  if (!targetUrl) {
    try {
      const { getUserSettings } = await import("@/services/settingsService");
      const settings = await getUserSettings();
      targetUrl = (settings as any)?.pptx_template_url || undefined;
    } catch {
      // ignore, fall through to default
    }
  }

  // Default template (with proper encoding for the accented filename)
  if (!targetUrl) {
    targetUrl = encodeURI("/Solicitação de vistoria.docx");
  }

  try {
    // Always encode the URL to handle accented characters and spaces
    const safeUrl = targetUrl.startsWith("http") ? targetUrl : encodeURI(decodeURIComponent(targetUrl));
    const resp = await fetch(safeUrl);

    if (!resp.ok) {
      throw new Error(`Falha ao carregar template DOCX (HTTP ${resp.status}). Verifique se o arquivo está em /public ou configure um template nas Configurações.`);
    }

    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      throw new Error("O servidor retornou HTML ao invés do arquivo DOCX. Verifique se o template está na pasta /public com o nome correto.");
    }

    const arrayBuffer = await resp.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // DOCX content is in word/document.xml
    const docXml = await zip.file("word/document.xml")?.async("string");
    if (!docXml) return [];

    // Robust token detection
    // 1. Extract all text runs to handle fragmented tokens
    const textNodeRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/gi;
    const runs: string[] = [];
    let match;
    while ((match = textNodeRegex.exec(docXml)) !== null) {
      runs.push(match[1] || "");
    }
    const fullText = runs.join("");

    // 2. Find all {{tokens}}
    const tokenRegex = /\{\{\s*([^}]+?)\s*\}\}/g;
    const tokens = new Set<string>();
    let tokenMatch;
    while ((tokenMatch = tokenRegex.exec(fullText)) !== null) {
      tokens.add(tokenMatch[1].trim());
    }

    return Array.from(tokens);
  } catch (err: any) {
    console.error("docxScanner error:", err);
    throw err; // re-throw so the UI can show the real error
  }
}
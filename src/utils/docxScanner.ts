"use client";

import JSZip from "jszip";

/**
 * Scans a DOCX template (word/document.xml) for tokens in the form {{tokenName}}.
 * Handles tokens split across multiple <w:t> nodes by joining them.
 */

export async function scanDocxTemplate(url: string = "/Solicitação de vistoria.docx"): Promise<string[]> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Falha ao carregar template: ${resp.status}`);
    
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
  } catch (err) {
    console.error("docxScanner error:", err);
    return [];
  }
}
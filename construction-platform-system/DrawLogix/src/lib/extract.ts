/**
 * Extract plain text from an uploaded document. Supports .txt/.md/.csv (raw),
 * .docx (mammoth), and .pdf (unpdf). Never throws — returns "" for anything it can't
 * read (scanned PDF, encrypted, or a transient parse error) so a bad file can't fail
 * the whole upload; the caller treats "" as "no extractable text".
 */
export async function extractDocumentText(filename: string, buf: Buffer): Promise<string> {
  const lower = filename.toLowerCase();
  try {
    if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".csv") || lower.endsWith(".json")) {
      return buf.toString("utf8");
    }

    if (lower.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return value;
    }

    if (lower.endsWith(".pdf")) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      // Disable font/eval features so pdf.js never fetches standard fonts/cmaps over
      // the network during text extraction (the cause of intermittent ECONNRESET).
      const pdf = await getDocumentProxy(new Uint8Array(buf), {
        useSystemFonts: false,
        disableFontFace: true,
        isEvalSupported: false,
      } as Parameters<typeof getDocumentProxy>[1]);
      const { text } = await extractText(pdf, { mergePages: true });
      return Array.isArray(text) ? text.join("\n") : text;
    }
  } catch {
    // Unreadable file (scanned/encrypted/parse/network error) — treat as no text.
    return "";
  }
  return "";
}

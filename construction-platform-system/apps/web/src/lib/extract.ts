/**
 * Server-side document text extraction. PDF via unpdf, DOCX via mammoth, plain text
 * read directly. Dynamic imports so the heavy parsers load only when needed. Returns
 * extracted text (may be empty for scanned/image-only PDFs — caller handles that).
 *
 * (Law #9 note: extraction "touches a document" and would ideally be an async job in
 * the Python AI tier. It's done inline here for the deterministic foundation; the
 * Python pipeline replaces it when the AI generation lands.)
 */
export async function extractDocumentText(filename: string, buffer: Buffer): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  if (["txt", "md", "csv", "json"].includes(ext)) {
    return buffer.toString("utf8");
  }

  if (ext === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  // Unknown type: best-effort utf8 (the document is still stored on disk).
  return buffer.toString("utf8");
}

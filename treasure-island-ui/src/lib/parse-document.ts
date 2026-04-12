// Extract plain text from PDF, DOCX, or TXT files
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (ext === "txt" || ext === "md") {
    return buffer.toString("utf-8");
  }

  if (ext === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const tmpPath = join(tmpdir(), `pdf-${randomUUID()}.pdf`);
    writeFileSync(tmpPath, buffer);
    try {
      const parser = new PDFParse({ url: `file://${tmpPath}` });
      const result = await parser.getText();
      return result.text;
    } finally {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Unsupported file type: .${ext}. Use PDF, DOCX, or TXT.`);
}

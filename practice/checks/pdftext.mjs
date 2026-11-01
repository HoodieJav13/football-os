// Extract the text of a PDF produced by Page.printToPDF, using macOS PDFKit
// through JavaScript for Automation (built in; nothing installed). Used to
// prove that printed content really contains an end marker.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JXA = `ObjC.import('PDFKit');
function run(argv) {
  const d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0]));
  if (!d) return JSON.stringify({ error: 'unreadable pdf' });
  const pages = [];
  for (let i = 0; i < d.pageCount; i++) pages.push(ObjC.unwrap(d.pageAtIndex(i).string) || '');
  return JSON.stringify({ pageCount: Number(d.pageCount), pages });
}`;

export function pdfText(base64) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pwp-pdftext-')), 'doc.pdf');
  fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  try {
    const r = spawnSync('osascript', ['-l', 'JavaScript', '-e', JXA, file], { encoding: 'utf8', timeout: 30000 });
    if (r.status !== 0) throw new Error(`pdf text extraction failed: ${r.stderr}`);
    const out = JSON.parse(r.stdout.trim());
    if (out.error) throw new Error(out.error);
    return { ...out, text: out.pages.join('\n') };
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
}

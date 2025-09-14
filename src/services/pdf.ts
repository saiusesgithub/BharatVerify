import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

export async function generateQrPngBytes(text: string): Promise<Buffer> {
  const buf = await QRCode.toBuffer(text, { type: 'png', margin: 1, width: 256 });
  return Buffer.from(buf);
}

export async function stampQr(pdfBytes: Buffer, qrPngBytes: Buffer, position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' = 'bottom-right'): Promise<Buffer> {
  const pdf = await PDFDocument.load(pdfBytes);
  const png = await pdf.embedPng(qrPngBytes);
  const pages = pdf.getPages();
  const page = pages[pages.length - 1];
  const { width, height } = page.getSize();
  const qrW = 100;
  const qrH = (png.height / png.width) * qrW;
  let x = width - qrW - 36;
  let y = 36;
  if (position === 'bottom-left') { x = 36; y = 36; }
  if (position === 'top-right') { x = width - qrW - 36; y = height - qrH - 36; }
  if (position === 'top-left') { x = 36; y = height - qrH - 36; }
  page.drawImage(png, { x, y, width: qrW, height: qrH, opacity: 0.95 });
  return Buffer.from(await pdf.save());
}

export async function addMetadata(pdfBytes: Buffer, meta: { DocId?: string; IssuedAt?: string; IssuerAddr?: string; IssuerSig?: string }): Promise<Buffer> {
  const pdf = await PDFDocument.load(pdfBytes);
  if (meta.DocId) pdf.setTitle(`DocId:${meta.DocId}`);
  if (meta.IssuedAt) pdf.setSubject(`IssuedAt:${meta.IssuedAt}`);
  if (meta.IssuerAddr) pdf.setAuthor(meta.IssuerAddr);
  // Also draw a small invisible-ish text note near the QR for robustness
  const pages = pdf.getPages();
  const page = pages[pages.length - 1];
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const text = `DocId:${meta.DocId || ''} IssuedAt:${meta.IssuedAt || ''}`;
  page.drawText(text, { x: 36, y: 24, size: 8, font, color: rgb(0.2, 0.2, 0.2), opacity: 0.6 });
  return Buffer.from(await pdf.save());
}


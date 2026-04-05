import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import { generateBarcodeSVG } from './barcode-generator.js';

// ── Label Template Sizes ──

export interface LabelTemplate {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  columns: number;
  rows: number;
  pageWidth: number;  // points (72 per inch)
  pageHeight: number;
}

const MM_TO_PT = 2.835;

export const LABEL_TEMPLATES: LabelTemplate[] = [
  {
    id: '50x25mm',
    name: '50mm × 25mm (Thermal)',
    widthMm: 50,
    heightMm: 25,
    columns: 1,
    rows: 1,
    pageWidth: Math.round(50 * MM_TO_PT),
    pageHeight: Math.round(25 * MM_TO_PT),
  },
  {
    id: '50x30mm',
    name: '50mm × 30mm (Thermal)',
    widthMm: 50,
    heightMm: 30,
    columns: 1,
    rows: 1,
    pageWidth: Math.round(50 * MM_TO_PT),
    pageHeight: Math.round(30 * MM_TO_PT),
  },
  {
    id: '38x25mm',
    name: '38mm × 25mm (Thermal)',
    widthMm: 38,
    heightMm: 25,
    columns: 1,
    rows: 1,
    pageWidth: Math.round(38 * MM_TO_PT),
    pageHeight: Math.round(25 * MM_TO_PT),
  },
  {
    id: 'a4-sheet',
    name: 'A4 Sheet (3×10 grid)',
    widthMm: 210,
    heightMm: 297,
    columns: 3,
    rows: 10,
    pageWidth: 595,  // A4 in points
    pageHeight: 842,
  },
];

export function getTemplateById(id: string): LabelTemplate | undefined {
  return LABEL_TEMPLATES.find((t) => t.id === id);
}

// ── Label Item ──

export interface LabelItem {
  storeName: string;
  productName: string;
  size?: string;
  color?: string;
  mrp: number;
  barcode: string;
  quantity: number;
}

// ── Generate Labels PDF ──

export function generateLabelsPDF(
  items: LabelItem[],
  templateId: string = '50x25mm',
): Promise<Buffer> {
  const template = getTemplateById(templateId) ?? LABEL_TEMPLATES[0];

  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];

    if (template.id === 'a4-sheet') {
      // A4 grid layout
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 15, bottom: 15, left: 15, right: 15 },
      });

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const cellWidth = (595 - 30) / template.columns;  // usable width / columns
      const cellHeight = (842 - 30) / template.rows;

      let index = 0;
      for (const item of items) {
        for (let q = 0; q < item.quantity; q++) {
          const col = index % template.columns;
          const row = Math.floor(index / template.columns) % template.rows;

          if (index > 0 && col === 0 && row === 0) {
            doc.addPage();
          }

          const x = 15 + col * cellWidth;
          const y = 15 + row * cellHeight;

          renderLabel(doc, item, x, y, cellWidth, cellHeight);
          index++;
        }
      }

      doc.end();
    } else {
      // Thermal label — one label per page
      const doc = new PDFDocument({
        size: [template.pageWidth, template.pageHeight],
        margins: { top: 3, bottom: 3, left: 5, right: 5 },
      });

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      let first = true;
      for (const item of items) {
        for (let q = 0; q < item.quantity; q++) {
          if (!first) doc.addPage();
          first = false;

          renderLabel(doc, item, 5, 3, template.pageWidth - 10, template.pageHeight - 6);
        }
      }

      doc.end();
    }
  });
}

function renderLabel(
  doc: InstanceType<typeof PDFDocument>,
  item: LabelItem,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const fontSize = Math.min(7, height / 8);
  const lineHeight = fontSize + 2;

  // Store name
  doc.fontSize(fontSize - 1).font('Helvetica');
  doc.text(item.storeName, x, y, { width, align: 'center' });

  // Product name
  doc.fontSize(fontSize).font('Helvetica-Bold');
  doc.text(item.productName, x, y + lineHeight, { width, align: 'center', lineBreak: false });

  // Size + Color
  const attrs = [item.size, item.color].filter(Boolean).join(' · ');
  if (attrs) {
    doc.fontSize(fontSize - 1).font('Helvetica');
    doc.text(attrs, x, y + lineHeight * 2, { width, align: 'center' });
  }

  // Barcode SVG
  try {
    const barcodeSvg = generateBarcodeSVG(item.barcode);
    const barcodeY = y + lineHeight * (attrs ? 3 : 2.5);
    const barcodeHeight = height - lineHeight * (attrs ? 5 : 4.5);
    const barcodeWidth = Math.min(width - 10, 120);
    const barcodeX = x + (width - barcodeWidth) / 2;

    SVGtoPDF(doc, barcodeSvg, barcodeX, barcodeY, {
      width: barcodeWidth,
      height: Math.max(barcodeHeight, 15),
      preserveAspectRatio: 'xMidYMid meet',
    });
  } catch {
    // Fallback: just print barcode text
    doc.fontSize(fontSize - 1).font('Helvetica');
    doc.text(item.barcode, x, y + lineHeight * 3, { width, align: 'center' });
  }

  // MRP
  doc.fontSize(fontSize).font('Helvetica-Bold');
  doc.text(`MRP: ₹${item.mrp}`, x, y + height - lineHeight - 2, { width, align: 'center' });
}

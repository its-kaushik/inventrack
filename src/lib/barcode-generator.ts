import JsBarcode from 'jsbarcode';
import { DOMImplementation, XMLSerializer } from 'xmldom';

/**
 * Generate a Code-128 barcode as an SVG string.
 * Uses JsBarcode with xmldom for server-side SVG rendering.
 */
export function generateBarcodeSVG(value: string): string {
  const xmlSerializer = new XMLSerializer();
  const doc = new DOMImplementation().createDocument(
    'http://www.w3.org/1999/xhtml',
    'html',
    null,
  );
  const svgNode = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');

  JsBarcode(svgNode, value, {
    xmlDocument: doc,
    format: 'CODE128',
    width: 2,
    height: 40,
    displayValue: true,
    fontSize: 12,
    margin: 5,
  });

  return xmlSerializer.serializeToString(svgNode);
}

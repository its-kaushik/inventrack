declare module 'xmldom' {
  export class DOMImplementation {
    createDocument(namespaceURI: string | null, qualifiedName: string, doctype: null): Document;
  }
  export class XMLSerializer {
    serializeToString(node: any): string;
  }
}

declare module 'svg-to-pdfkit' {
  function SVGtoPDF(
    doc: any,
    svg: string,
    x: number,
    y: number,
    options?: {
      width?: number;
      height?: number;
      preserveAspectRatio?: string;
    },
  ): void;
  export default SVGtoPDF;
}

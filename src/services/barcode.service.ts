import bwipjs from 'bwip-js';

export async function generateBarcode(value: string): Promise<Buffer> {
  const png = await bwipjs.toBuffer({
    bcid: 'code128',
    text: value,
    scale: 3,
    height: 10,
    includetext: true,
    textxalign: 'center',
  });
  return Buffer.from(png);
}

/**
 * Barcode format check shared by every scan input.
 *
 * Every barcode in the system is a 2-letter type prefix followed by 6 characters
 * (CB child box, MC master carton, SR sample, EC e-commerce package). The legacy long
 * format BINNY-XX-{id} is still accepted. A handheld scanner that drops a repeated key
 * produces a 7-character code, which this rejects before it reaches the server or a list.
 */
const SHORT = /^(CB|MC|SR|EC)[0-9A-Z]{6}$/;
const LONG = /^BINNY-(CB|MC|SR|EC)-[A-Za-z0-9-]+$/i;

export function isValidBarcode(code: string): boolean {
  const c = code.trim();
  return SHORT.test(c) || LONG.test(c);
}

export const BARCODE_MISREAD_MESSAGE = (code: string) =>
  `Misread "${code}" — a barcode is 2 letters + 6 characters (8 total). Please scan again.`;

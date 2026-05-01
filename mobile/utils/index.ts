/**
 * Format a date string to a readable format.
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Truncate a string to maxLength and append ellipsis.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Parse QR code string and detect type (child/master/sample/ecommerce).
 */
export function parseQRCode(raw: string): {
  type: 'child' | 'master' | 'sample' | 'ecommerce' | 'unknown';
  id: string;
} {
  const trimmed = raw.trim();
  // Extract the BINNY-CB-... / BINNY-MC-... / BINNY-SR-... / BINNY-EC-... token from anywhere in the string.
  const match = trimmed.match(/BINNY-(CB|MC|SR|EC)-[A-Za-z0-9-]+/i);
  if (!match) return { type: 'unknown', id: trimmed };
  const token = match[0].toUpperCase();
  if (token.startsWith('BINNY-CB-')) return { type: 'child', id: token };
  if (token.startsWith('BINNY-MC-')) return { type: 'master', id: token };
  if (token.startsWith('BINNY-SR-')) return { type: 'sample', id: token };
  if (token.startsWith('BINNY-EC-')) return { type: 'ecommerce', id: token };
  return { type: 'unknown', id: token };
}

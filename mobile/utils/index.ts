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
 * Recognises both the new short format (8 chars: 2-char type prefix + 6 Crockford Base32)
 * and the legacy long format (BINNY-XX-{uuid}).
 */
export function parseQRCode(raw: string): {
  type: 'child' | 'master' | 'sample' | 'ecommerce' | 'unknown';
  id: string;
} {
  const trimmed = raw.trim();

  // New short format: 8 chars, type prefix + 6 Crockford Base32 chars
  const shortMatch = trimmed.match(/^(CB|MC|SR|EC)[0-9A-Z]{6}$/);
  if (shortMatch) {
    const prefix = shortMatch[1];
    if (prefix === 'CB') return { type: 'child', id: trimmed };
    if (prefix === 'MC') return { type: 'master', id: trimmed };
    if (prefix === 'SR') return { type: 'sample', id: trimmed };
    if (prefix === 'EC') return { type: 'ecommerce', id: trimmed };
  }

  // Legacy long format: BINNY-XX-{uuid}, possibly embedded in surrounding text
  const longMatch = trimmed.match(/BINNY-(CB|MC|SR|EC)-[A-Za-z0-9-]+/i);
  if (longMatch) {
    const token = longMatch[0].toUpperCase();
    if (token.startsWith('BINNY-CB-')) return { type: 'child', id: token };
    if (token.startsWith('BINNY-MC-')) return { type: 'master', id: token };
    if (token.startsWith('BINNY-SR-')) return { type: 'sample', id: token };
    if (token.startsWith('BINNY-EC-')) return { type: 'ecommerce', id: token };
  }

  return { type: 'unknown', id: trimmed };
}

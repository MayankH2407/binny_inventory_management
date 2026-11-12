import { isValidBarcode, parseQRCode } from '../../utils';

describe('isValidBarcode', () => {
  it.each(['CBNE1SSQ', 'MCABC123', 'SR000001', 'EC9Z8Y7X', ' CBNE1SSQ '])('accepts %p', (code) => {
    expect(isValidBarcode(code)).toBe(true);
  });

  it('accepts the legacy long format', () => {
    expect(isValidBarcode('BINNY-CB-3f2a9c1e-aaaa-bbbb-cccc-123456789012')).toBe(true);
  });

  it.each([
    'CBNE1SQ', // a scanner dropped one of the doubled S (the reported misread)
    'CBNE1SSSQ', // extra character
    'CBNE1S', // truncated
    'XXNE1SSQ', // unknown prefix
    'cbne1ssq', // lowercase is normalised upstream, not accepted here
    '',
    'https://example.com/x',
  ])('rejects %p', (code) => {
    expect(isValidBarcode(code)).toBe(false);
  });

  it('keeps parseQRCode type detection unchanged', () => {
    expect(parseQRCode('CBNE1SSQ').type).toBe('child');
    expect(parseQRCode('CBNE1SQ').type).toBe('unknown');
  });
});

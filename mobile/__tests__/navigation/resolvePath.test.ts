import { resolvePath } from '../../navigation/resolvePath';

const PATTERNS = [
  '/samples',
  '/samples/:id',
  '/dispatch',
  '/dispatch/create',
  '/dispatch/:id',
  '/master-cartons/create',
  '/master-cartons/:id',
];

describe('resolvePath', () => {
  it('resolves a static route', () => {
    expect(resolvePath('/samples', PATTERNS)).toEqual({ kind: 'screen', name: '/samples', params: {} });
  });

  it('extracts a dynamic id', () => {
    expect(resolvePath('/samples/abc-123', PATTERNS)).toEqual({
      kind: 'screen',
      name: '/samples/:id',
      params: { id: 'abc-123' },
    });
  });

  it('prefers a static segment over a dynamic one ("create" is not an id)', () => {
    expect(resolvePath('/dispatch/create', PATTERNS)).toEqual({ kind: 'screen', name: '/dispatch/create', params: {} });
    expect(resolvePath('/master-cartons/create', PATTERNS)).toMatchObject({ name: '/master-cartons/create' });
    expect(resolvePath('/dispatch/9f1', PATTERNS)).toMatchObject({ name: '/dispatch/:id', params: { id: '9f1' } });
  });

  it('ignores a query string or hash', () => {
    expect(resolvePath('/samples/42?x=1#y', PATTERNS)).toMatchObject({ params: { id: '42' } });
  });

  it('decodes URL-encoded params', () => {
    expect(resolvePath('/samples/a%20b', PATTERNS)).toMatchObject({ params: { id: 'a b' } });
  });

  it('maps the tab shell and login group paths', () => {
    expect(resolvePath('/(tabs)', PATTERNS)).toEqual({ kind: 'main' });
    expect(resolvePath('/(tabs)/inventory', PATTERNS)).toEqual({ kind: 'main' });
    expect(resolvePath('/', PATTERNS)).toEqual({ kind: 'main' });
    expect(resolvePath('/(auth)/login', PATTERNS)).toEqual({ kind: 'login' });
  });

  it('reports an unknown path instead of guessing', () => {
    expect(resolvePath('/nope/1/2', PATTERNS)).toEqual({ kind: 'unknown', path: '/nope/1/2' });
    expect(resolvePath('/ecommerce/create', PATTERNS)).toEqual({ kind: 'unknown', path: '/ecommerce/create' });
  });
});

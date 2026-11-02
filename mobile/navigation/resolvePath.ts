export type ResolvedTarget =
  | { kind: 'main' }
  | { kind: 'login' }
  | { kind: 'screen'; name: string; params: Record<string, string> }
  | { kind: 'unknown'; path: string };

const segmentsOf = (p: string) => p.split('/').filter(Boolean);

/**
 * Resolve a URL-style path to a navigation target against a list of route patterns
 * ('/samples/:id'). Static segments always win over dynamic ones, so '/dispatch/create'
 * is the create screen, not dispatch id "create". '/(tabs)…' means the bottom-tab shell
 * and '/(auth)/login' the login screen. Pure — no React Navigation, no screens.
 */
export function resolvePath(rawPath: string, patterns: string[]): ResolvedTarget {
  const path = rawPath.split('?')[0].split('#')[0];
  if (path === '/(auth)/login' || path === '/login') return { kind: 'login' };
  if (path === '/' || path === '/(tabs)' || path.startsWith('/(tabs)/')) return { kind: 'main' };

  const want = segmentsOf(path);
  let best: { name: string; params: Record<string, string>; statics: number } | null = null;
  for (const pattern of patterns) {
    const have = segmentsOf(pattern);
    if (have.length !== want.length) continue;
    const params: Record<string, string> = {};
    let statics = 0;
    let ok = true;
    for (let i = 0; i < have.length; i++) {
      if (have[i].startsWith(':')) {
        params[have[i].slice(1)] = decodeURIComponent(want[i]);
      } else if (have[i] === want[i]) {
        statics++;
      } else {
        ok = false;
        break;
      }
    }
    if (ok && (!best || statics > best.statics)) best = { name: pattern, params, statics };
  }
  return best ? { kind: 'screen', name: best.name, params: best.params } : { kind: 'unknown', path };
}

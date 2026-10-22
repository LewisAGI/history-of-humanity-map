export interface PagesHeaderRule {
  path: string;
  headers: Record<string, string>;
}

/** Cloudflare Pages `_headers` blocks. Indented lines belong to the path above them. */
export function parsePagesHeaders(text: string): PagesHeaderRule[] {
  const rules: PagesHeaderRule[] = [];
  let current: PagesHeaderRule | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line || line.trimStart().startsWith('#')) continue;
    if (/^\s/.test(line)) {
      if (!current) continue;
      const match = line.trim().match(/^([^:]+):\s*(.*)$/);
      if (!match) continue;
      current.headers[match[1]] = match[2];
      continue;
    }
    current = { path: line.trim(), headers: {} };
    rules.push(current);
  }
  return rules;
}

export function pagesPathMatches(pattern: string, pathname: string): boolean {
  if (pattern === '/*') return pathname.startsWith('/');
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1);
    return pathname === prefix.slice(0, -1) || pathname.startsWith(prefix);
  }
  return pathname === pattern;
}

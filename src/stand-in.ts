/** Coarse location notes. Site-level and city-level points are not stand-ins. */
export function standInFromMethod(method: string | undefined): { treatment: 'flagged' | 'hidden'; note: string } | null {
  if (!method) return null;
  if (/\bPROXY\b/.test(method)) return { treatment: 'hidden', note: 'Proxy location is not plotted' };
  if (/centroid/i.test(method)) {
    if (/country/i.test(method)) return { treatment: 'flagged', note: 'Country centroid, not a landing site' };
    if (/region/i.test(method)) return { treatment: 'flagged', note: 'Region centroid, not the site' };
    return { treatment: 'flagged', note: 'Centroid, not the site' };
  }
  if (/town-level/i.test(method)) return { treatment: 'flagged', note: 'Town stand-in, not the site' };
  if (/district-level/i.test(method)) return { treatment: 'flagged', note: 'District stand-in, not the site' };
  if (/\bapproximate\b/i.test(method)) return { treatment: 'flagged', note: 'Approximate regional point, not the site' };
  return null;
}

/** Shared external-link attributes. Popup HTML and the depth sheet both use this. */
export function externalRel(): string {
  return 'noopener noreferrer';
}

/** Parks Australia pages on uluru.gov.au. Any other host is refused. */
export function parksAustraliaUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:') return undefined;
  const host = parsed.hostname.toLowerCase();
  if (host !== 'uluru.gov.au' && !host.endsWith('.uluru.gov.au')) return undefined;
  return url;
}

export function isUluruPin(event: { id: string; packId?: string }): boolean {
  return event.id === 'uluru-link' || event.packId === 'uluru-link';
}

/**
 * Basemap tiles come from NASA GIBS. A 502 often omits Access-Control-Allow-Origin.
 * Chromium logs "Failed to load resource" without the page origin. WebKit logs the
 * page origin inside one fixed sentence and raises a page error that names the tile.
 * Only that tile host is ignored. The hostname is parsed with `new URL` and must be
 * exactly gibs.earthdata.nasa.gov. A worker miss and a same-origin asset miss stay.
 */
const GIBS_HOST = 'gibs.earthdata.nasa.gov';

/** WebKit's whole console line for one cross-origin failure. Extra text does not match. */
const WEBKIT_CORS =
  /^(?:Failed to load resource: )?Origin https?:\/\/\S+ is not allowed by Access-Control-Allow-Origin\. Status code: \d+$/;

export interface ConsoleFaultSource {
  locationUrl?: string;
  /** Failed request URLs seen in this test. Used when the console line does not name the tile. */
  failedRequestUrls?: readonly string[];
}

/** MapLibre's own tile and image load failures. Any other error that names the tile still counts. */
const TILE_FAILURE = /\bAJAXError\b|Could not load image/i;

/** The whole WebKit page error. Text before or after the sentence stays a fault. */
const WEBKIT_PAGE_ERROR =
  /^(?:https?:\/\/\S+|\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/\S*)?) due to access control checks\.?$/i;

function securityPolicy(text: string): boolean {
  return /content-security-policy|content security policy/i.test(text);
}

export function ignorableConsole(text: string, source: ConsoleFaultSource = {}): boolean {
  if (/Worker failed to load/i.test(text)) return false;
  if (/\bTypeError\b/.test(text)) return false;
  if (securityPolicy(text)) return false;
  if (/not allowed by Access-Control-Allow-Origin/i.test(text)) {
    if (!WEBKIT_CORS.test(text)) return false;
    return gibsFailure(text, source);
  }
  if (/^Failed to load resource: /i.test(text)) {
    if (/127\.0\.0\.1|localhost|\/assets\//i.test(text)) return false;
    if (namesOtherHost(text)) return false;
    if (namesExactGibs(text)) return true;
    if (source.locationUrl && isExactGibsUrl(source.locationUrl)) return true;
    // Aborted basemap tiles are reported without a host.
    return quotedUrls(text).length === 0 && pathHostUrl(text) == null;
  }
  return TILE_FAILURE.test(text) && namesExactGibs(text) && !namesOtherHost(text);
}

export function ignorablePageError(message: string): boolean {
  if (/\bTypeError\b/.test(message)) return false;
  if (/Worker failed to load/i.test(message)) return false;
  if (securityPolicy(message)) return false;
  const text = message.trim();
  if (!WEBKIT_PAGE_ERROR.test(text)) return false;
  return namesExactGibs(text) && !namesOtherHost(text);
}

export function settleConsoleFaults(
  faults: string[],
  pending: readonly { text: string; locationUrl: string }[],
  failedRequestUrls: readonly string[],
): void {
  for (const entry of pending) {
    if (ignorableConsole(entry.text, { locationUrl: entry.locationUrl, failedRequestUrls })) continue;
    faults.push(`console: ${entry.text}`);
  }
}

function gibsFailure(text: string, source: ConsoleFaultSource): boolean {
  const failed = source.failedRequestUrls ?? [];
  const otherFailed = failed.some((url) => {
    const host = hostnameOf(url);
    return host != null && host !== GIBS_HOST;
  });
  // A local or third-party miss in the same test is not covered by a GIBS tile.
  if (otherFailed) return false;
  if (source.locationUrl && isExactGibsUrl(source.locationUrl)) return true;
  const cited = failed.filter((url) => text.includes(url) || (source.locationUrl != null && sameUrl(url, source.locationUrl)));
  if (cited.length > 0) return cited.some(isExactGibsUrl);
  if (source.locationUrl) {
    const host = hostnameOf(source.locationUrl);
    // The page URL is where the console line was logged, not a failed request.
    if (host && host !== GIBS_HOST && !(isLocalHost(host) && isDocumentLocation(source.locationUrl))) return false;
  }
  if (namesOtherHost(resourceText(text))) return false;
  const gibs = failed.filter(isExactGibsUrl);
  const other = failed.filter((url) => {
    const host = hostnameOf(url);
    return host != null && host !== GIBS_HOST;
  });
  return gibs.length > 0 && other.length === 0;
}

function namesExactGibs(text: string): boolean {
  return hostCandidates(text).some((url) => isExactGibsUrl(url));
}

function namesOtherHost(text: string): boolean {
  return hostCandidates(text).some((url) => {
    const host = hostnameOf(url);
    return host != null && host !== GIBS_HOST;
  });
}

function hostCandidates(text: string): string[] {
  const values = quotedUrls(resourceText(text));
  const pathUrl = pathHostUrl(text);
  if (pathUrl) values.push(pathUrl);
  return values;
}

/** The Origin clause names the page, not the tile that failed. */
function resourceText(text: string): string {
  return text.replace(/Origin https?:\/\/\S+/g, '');
}

function quotedUrls(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s'")]+/g)].map((match) => match[0].replace(/[),.;]+$/, ''));
}

/**
 * WebKit page errors name the tile as /gibs.earthdata.nasa.gov/wmts/….jpg
 * without a scheme. The host is still parsed with `new URL`.
 */
function pathHostUrl(text: string): string | null {
  const match = text.match(/(?:^|\s)\/([A-Za-z0-9.-]+\.[A-Za-z]{2,})(\/[^\s]*)?/);
  if (!match) return null;
  const path = (match[2] ?? '/').replace(/[),.;]+$/, '');
  return `https://${match[1]}${path}`;
}

export function isGibsTileUrl(value: string): boolean {
  return isExactGibsUrl(value);
}

function isExactGibsUrl(value: string): boolean {
  return hostnameOf(value) === GIBS_HOST;
}

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function sameUrl(left: string, right: string): boolean {
  try {
    return new URL(left).href === new URL(right).href;
  } catch {
    return false;
  }
}

function isLocalHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost';
}

export function isLocalUrl(value: string): boolean {
  const host = hostnameOf(value);
  return host != null && isLocalHost(host);
}

/** A failed local request is always a fault. A GIBS tile failure is not. */
export function localRequestFault(url: string): string | null {
  if (!isLocalUrl(url)) return null;
  return `failed: ${url}`;
}

function isDocumentLocation(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.pathname === '/' || url.pathname === '/index.html') && url.search === '' && url.hash === '';
  } catch {
    return false;
  }
}

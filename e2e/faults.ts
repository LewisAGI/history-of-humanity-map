/**
 * Basemap tiles come from NASA GIBS. A 502 often omits Access-Control-Allow-Origin.
 * Chromium logs "Failed to load resource" without the page origin. WebKit logs the
 * page origin inside a CORS sentence and raises a page error that names the tile.
 * Those are the same external failure. A worker miss and a same-origin asset miss stay.
 */
export function ignorableConsole(text: string): boolean {
  if (/Worker failed to load/i.test(text)) return false;
  if (/gibs\.earthdata\.nasa\.gov/i.test(text)) return true;
  if (/not allowed by Access-Control-Allow-Origin/i.test(text)) return true;
  return /^Failed to load resource: /i.test(text) && !/127\.0\.0\.1|\/assets\//.test(text);
}

export function ignorablePageError(message: string): boolean {
  return /gibs\.earthdata\.nasa\.gov/i.test(message) && /access control checks/i.test(message);
}

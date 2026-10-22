import { describe, expect, it } from 'vitest';
import { ignorableConsole, ignorablePageError } from '../e2e/faults';

const WEBKIT = 'Origin http://127.0.0.1:4173 is not allowed by Access-Control-Allow-Origin. Status code: 502';
const WEBKIT_FAILED = `Failed to load resource: ${WEBKIT}`;
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/4/7/10.jpg';
const TILE_ERROR = '/gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/4/7/10.jpg due to access control checks.';

describe('basemap fault filter', () => {
  it('ignores a GIBS WebKit 502 only when the location or the matching failed request is that host', () => {
    expect(ignorableConsole(WEBKIT, { locationUrl: GIBS })).toBe(true);
    expect(ignorableConsole(WEBKIT_FAILED, { locationUrl: GIBS })).toBe(true);
    expect(
      ignorableConsole(WEBKIT, {
        locationUrl: 'http://127.0.0.1:4173/',
        failedRequestUrls: [GIBS],
      }),
    ).toBe(true);
    expect(
      ignorableConsole(WEBKIT, {
        locationUrl: GIBS,
        failedRequestUrls: [GIBS],
      }),
    ).toBe(true);
    expect(ignorableConsole(WEBKIT)).toBe(false);
    expect(ignorableConsole('Failed to load resource: the server responded with a status of 502 ()')).toBe(true);
    expect(ignorableConsole(`Failed to load resource: ${GIBS}`)).toBe(true);
    expect(ignorablePageError(TILE_ERROR)).toBe(true);
    expect(ignorablePageError(`${GIBS} due to access control checks.`)).toBe(true);
  });

  it('still counts CORS from any host that is not exactly gibs.earthdata.nasa.gov', () => {
    expect(
      ignorableConsole(WEBKIT, {
        locationUrl: 'http://127.0.0.1:4173/assets/index.js',
        failedRequestUrls: ['http://127.0.0.1:4173/assets/index.js'],
      }),
    ).toBe(false);
    expect(
      ignorableConsole(WEBKIT, {
        locationUrl: 'https://cdn.example.com/lib.js',
        failedRequestUrls: ['https://cdn.example.com/lib.js'],
      }),
    ).toBe(false);
    expect(
      ignorableConsole(WEBKIT, {
        locationUrl: 'https://cdn.example.com/lib.js',
        failedRequestUrls: [GIBS, 'https://cdn.example.com/lib.js'],
      }),
    ).toBe(false);
    const lookalike = 'https://gibs.earthdata.nasa.gov.evil.com/wmts/a.jpg';
    expect(ignorableConsole(WEBKIT, { locationUrl: lookalike, failedRequestUrls: [lookalike] })).toBe(false);
    expect(ignorableConsole(`Failed to load resource: ${lookalike}`)).toBe(false);
    expect(ignorableConsole(lookalike)).toBe(false);
    expect(ignorablePageError(`${lookalike} due to access control checks.`)).toBe(false);
    expect(ignorablePageError('/gibs.earthdata.nasa.gov.evil.com/wmts/a.jpg due to access control checks.')).toBe(false);
    expect(ignorablePageError('https://evil.example/wmts?host=gibs.earthdata.nasa.gov due to access control checks.')).toBe(false);
    expect(ignorableConsole('Failed to load resource: http://127.0.0.1:4173/assets/app.js')).toBe(false);
    expect(ignorableConsole('Worker failed to load https://gibs.earthdata.nasa.gov/worker.js')).toBe(false);
  });

  it('still counts CSP refusals, TypeErrors, and extra text after the WebKit sentence', () => {
    const csp = "Refused to connect to 'https://gibs.earthdata.nasa.gov/wmts/a.jpg' because it violates the document's Content Security Policy";
    expect(ignorableConsole(csp, { locationUrl: GIBS, failedRequestUrls: [GIBS] })).toBe(false);
    expect(ignorablePageError(`${csp} due to access control checks.`)).toBe(false);
    expect(ignorableConsole(`TypeError: failed ${GIBS}`, { locationUrl: GIBS })).toBe(false);
    expect(ignorablePageError('TypeError: Cannot read properties of undefined (gibs.earthdata.nasa.gov)')).toBe(false);
    expect(ignorablePageError('TypeError: https://gibs.earthdata.nasa.gov/wmts/a.jpg due to access control checks.')).toBe(false);
    expect(ignorablePageError('failed to draw gibs.earthdata.nasa.gov tile')).toBe(false);
    expect(ignorableConsole(`${WEBKIT} extra`, { locationUrl: GIBS, failedRequestUrls: [GIBS] })).toBe(false);
    expect(ignorableConsole(`${WEBKIT_FAILED} extra`, { locationUrl: GIBS, failedRequestUrls: [GIBS] })).toBe(false);
  });
});

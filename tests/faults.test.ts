import { describe, expect, it } from 'vitest';
import { ignorableConsole, ignorablePageError } from '../e2e/faults';

describe('basemap fault filter', () => {
  it('ignores WebKit CORS wording for a GIBS 502 and still records app faults', () => {
    const tile = '/gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/4/7/10.jpg due to access control checks.';
    expect(ignorablePageError(tile)).toBe(true);
    expect(ignorableConsole('Origin http://127.0.0.1:4173 is not allowed by Access-Control-Allow-Origin. Status code: 502')).toBe(true);
    expect(
      ignorableConsole('Failed to load resource: Origin http://127.0.0.1:4173 is not allowed by Access-Control-Allow-Origin. Status code: 502'),
    ).toBe(true);
    expect(ignorableConsole('Failed to load resource: the server responded with a status of 502 ()')).toBe(true);
    expect(ignorableConsole('Failed to load resource: http://127.0.0.1:4173/assets/app.js')).toBe(false);
    expect(ignorableConsole('Worker failed to load')).toBe(false);
    expect(ignorablePageError('TypeError: Cannot read properties of undefined')).toBe(false);
    expect(ignorablePageError('failed to draw gibs.earthdata.nasa.gov tile')).toBe(false);
  });
});
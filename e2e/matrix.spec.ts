import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

declare global {
  interface Window {
    __moves: number;
  }
}

const shots = path.join('test-results', 'screenshots');

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 553 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 667, height: 375 },
  { width: 734, height: 343 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
  { width: 1024, height: 600 },
  { width: 1440, height: 900 },
];

const ROUTES: { id: string; date: string }[] = [
  { id: 'out-of-africa', date: '68050 BCE' },
  { id: 'bantu-expansion', date: '1000 BCE' },
  { id: 'mansa-musa', date: '1324' },
  { id: 'zhang-qian', date: '139 BCE' },
  { id: 'silk-road', date: '130 BCE' },
  { id: 'mongol-conquests', date: '1206' },
  { id: 'ibn-battuta', date: '1325' },
  { id: 'zheng-he', date: '1405' },
  { id: 'xuanzang', date: '629' },
  { id: 'viking-voyages', date: '870' },
  { id: 'peopling-of-the-americas', date: '14000 BCE' },
  { id: 'thule-migration', date: '1000' },
  { id: 'inca-expansion', date: '1438' },
  { id: 'columbus-1492', date: '1492' },
  { id: 'cortes', date: '1519' },
  { id: 'atlantic-slave-trade', date: '1518' },
  { id: 'trail-of-tears', date: '1830' },
  { id: 'madjedbebe', date: '63050 BCE' },
  { id: 'austronesian-voyages', date: '3000 BCE' },
  { id: 'lapita', date: '1100 BCE' },
  { id: 'polynesian-voyages', date: '900' },
  { id: 'hawaii-settlement', date: '1000' },
  { id: 'aotearoa-settlement', date: '1250' },
  { id: 'rapa-nui', date: '1200' },
  { id: 'madagascar-settlement', date: '500' },
  { id: 'cook-pacific', date: '1768' },
];

const PINS: { id: string; date: string }[] = [
  { id: 'hastings', date: '1066' },
  { id: 'tiananmen-1989', date: '1989' },
  { id: 'qesem-fire', date: '298050 BCE' },
  { id: 'great-zimbabwe', date: '1100' },
  { id: 'cahokia', date: '1050' },
  { id: 'magna-carta', date: '1215' },
  { id: 'sharpeville', date: '1960' },
  { id: 'hangul', date: '1446' },
  { id: 'tulsa', date: '1921' },
  { id: 'apollo-11', date: '1969' },
  { id: 'lascaux', date: '15050 BCE' },
  { id: 'pompeii', date: '79' },
  { id: 'gilgamesh', date: '2100 BCE' },
  { id: 'inanna-descent', date: '1900 BCE' },
  { id: 'trojan-war', date: '1184 BCE' },
  { id: 'troy-bronze-age', date: '1700 BCE' },
  { id: 'socrates', date: '399 BCE' },
  { id: 'theseus', date: '750 BCE' },
  { id: 'narmer-palette', date: '3100 BCE' },
  { id: 'nile-hieroglyphs', date: '3200 BCE' },
  { id: 'moai', date: '1250' },
  { id: 'kamehameha', date: '1810' },
  { id: 'kumulipo', date: '1700' },
  { id: 'amundsen-pole', date: '1911' },
  { id: 'scott-pole', date: '1912' },
  { id: 'angkor-802', date: '802' },
  { id: 'mabo-decision', date: '1992' },
  { id: 'stonehenge', date: '3000 BCE' },
  { id: 'petra', date: '100 BCE' },
  { id: 'teotihuacan', date: '100' },
  { id: 'uluru-handback', date: '1985' },
];

let faults: string[] = [];

test.beforeAll(() => {
  fs.mkdirSync(shots, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  faults = [];
  page.on('pageerror', (error) => faults.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (ignorableConsole(text)) return;
    faults.push(`console: ${text}`);
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    try {
      if (new URL(response.url()).origin !== 'http://127.0.0.1:4173') return;
    } catch {
      return;
    }
    faults.push(`http ${response.status()} ${response.url()}`);
  });
});

test.afterEach(() => {
  expect(faults).toEqual([]);
});

for (const viewport of VIEWPORTS) {
  test(`layout matrix ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('matrix-'), 'matrix projects only');
    test.setTimeout(240_000);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('#app[data-ready="true"]').waitFor();
    await page.evaluate(() => {
      window.__moves = 0;
      window.__historyMap.on('moveend', () => {
        window.__moves += 1;
      });
    });
    const failures: string[] = [];
    let black: number | null = null;
    try {
    for (const route of ROUTES) {
      await show(page, route.date, route.id);
      const vis = await routeVisibility(page);
      const card = await cardState(page);
      if (vis.pct < 0.5 || vis.heads < 1 || vis.headsClear !== vis.heads) {
        failures.push(`${route.id} ${Math.round(vis.pct * 100)}% heads ${vis.headsClear}/${vis.heads} ${vis.headMiss}`);
      }
      if (!card.inside) failures.push(`${route.id} card outside`);
      if (!card.closeOk) failures.push(`${route.id} close ${card.closeWidth}x${card.closeHeight}`);
      if (card.mode !== expectedMode(viewport.width, viewport.height)) {
        failures.push(`${route.id} mode ${card.mode}`);
      }
      if (black === null) black = await blackEdge(page);
      if (['atlantic-slave-trade', 'zheng-he', 'cook-pacific'].includes(route.id)) {
        const name = `${viewport.width}x${viewport.height}`;
        if (
          (name === '360x640' || name === '375x553') &&
          ['atlantic-slave-trade', 'zheng-he', 'cook-pacific'].includes(route.id)
        ) {
          await page.screenshot({ path: path.join(shots, `r6_${name}_${route.id}.png`) });
        }
        if (name === '844x390' && route.id === 'cook-pacific') {
          await page.screenshot({ path: path.join(shots, 'r6_844x390_cook-pacific.png') });
        }
      }
    }
    for (const pin of PINS) {
      await openDate(page, pin.date);
      await page.evaluate((id) => new Promise<void>((resolve) => {
        const marker = document.querySelector<HTMLElement>(`.pin[data-id="${id}"]`);
        if (!marker) throw new Error(`missing pin ${id}`);
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        window.__historyMap.once('moveend', done);
        window.__historyMap.jumpTo({
          center: [Number(marker.dataset.lng), Number(marker.dataset.lat)],
          zoom: 2,
        });
        window.setTimeout(done, 500);
      }), pin.id);
      await page.evaluate(() => {
        window.__moves = 0;
      });
      await page.locator(`.pin[data-id="${pin.id}"]`).evaluate((element: HTMLElement) => element.click());
      const opened = await page.locator('#app[data-popup="in"]').waitFor({ timeout: 4_000 }).then(() => true).catch(() => false);
      if (!opened) {
        failures.push(`${pin.id} popup closed`);
        continue;
      }
      await page.waitForTimeout(600);
      const moves = await page.evaluate(() => window.__moves);
      const placed = await pinState(page, pin.id);
      if (moves > 1) failures.push(`${pin.id} moves ${moves}`);
      if (!placed.clear) failures.push(`${pin.id} hidden ${placed.reason}`);
      const card = await cardState(page);
      if (!card.inside) failures.push(`${pin.id} card outside`);
      if (!card.closeOk) failures.push(`${pin.id} close ${card.closeWidth}x${card.closeHeight}`);
    }
    } finally {
      const label = `${testInfo.project.name} ${viewport.width}x${viewport.height}`;
      fs.appendFileSync('/tmp/matrix-report.jsonl', `${JSON.stringify({ label, failures, black })}\n`);
    }
    expect(black ?? 0, 'black edge').toBeLessThan(64);
    expect(failures, `${testInfo.project.name} ${viewport.width}x${viewport.height}`).toEqual([]);
  });
}

test('rotation switches between the bottom sheet and the side sheet', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('matrix-'), 'matrix projects only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  await show(page, '1405', 'zheng-he');
  const portrait = await cardState(page);
  expect(portrait.mode).toBe('bottom');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(1200);
  const landscape = await cardState(page);
  expect(landscape.mode).toBe('side');
  const vis = await routeVisibility(page);
  expect(vis.pct).toBeGreaterThanOrEqual(0.5);
  expect(vis.headsClear).toBe(vis.heads);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1200);
  const desktop = await cardState(page);
  expect(desktop.mode).toBe('popup');
});

async function show(page: Page, date: string, id: string) {
  await openDate(page, date);
  await page.evaluate((eventId) => {
    const marker = document.querySelector<HTMLElement>(`.pin[data-id="${eventId}"]`);
    if (!marker) throw new Error(`missing pin ${eventId}`);
    window.__historyMap.jumpTo({
      center: [Number(marker.dataset.lng), Number(marker.dataset.lat)],
      zoom: 3,
    });
  }, id);
  await page.locator(`.pin[data-id="${id}"]`).click({ force: true });
  await expect(page.locator('#app')).toHaveAttribute('data-arrow', id);
  await expect(page.locator('#app')).toHaveAttribute('data-popup', 'in');
  await page.waitForFunction(() => !window.__historyMap.isMoving(), undefined, { timeout: 8_000 });
}

async function openDate(page: Page, value: string) {
  if (await page.locator('#date-popout').isHidden()) await page.locator('#period-button').click();
  await page.locator('#date-input').fill(value);
  await page.locator('#date-popout').evaluate((form: HTMLFormElement) => form.requestSubmit());
  await page.locator('#app[data-ready="true"]').waitFor();
}

function expectedMode(width: number, height: number): 'bottom' | 'side' | 'popup' {
  if (height > width) return 'bottom';
  if (height <= 620) return 'side';
  return 'popup';
}

async function cardState(page: Page) {
  return page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>('.event-sheet:not([hidden])');
    const popup = document.querySelector<HTMLElement>('.maplibregl-popup');
    const card = sheet ?? popup;
    if (!card) return { inside: false, closeOk: false, closeWidth: 0, closeHeight: 0, mode: 'none' };
    const rect = card.getBoundingClientRect();
    const inside = rect.left >= -1 && rect.top >= -1 && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1 && rect.width > 2;
    const controls = ['.zoom', '.key-wrap', '.time', '.maplibregl-ctrl-attrib', '.wordmark'];
    for (const selector of controls) {
      const control = document.querySelector(selector)?.getBoundingClientRect();
      if (!control || control.width < 2 || control.height < 2 || control.bottom < 0) continue;
      const hit = rect.left < control.right && rect.right > control.left && rect.top < control.bottom && rect.bottom > control.top;
      if (hit) return { inside: false, closeOk: false, closeWidth: 0, closeHeight: 0, mode: selector };
    }
    const close = card.querySelector<HTMLElement>('.sheet-close, .maplibregl-popup-close-button');
    const closeRect = close?.getBoundingClientRect();
    const hit = closeRect ? document.elementFromPoint(closeRect.left + closeRect.width / 2, closeRect.top + closeRect.height / 2) : null;
    const closeOk = !!closeRect && closeRect.width >= 44 && closeRect.height >= 44 && (hit === close || close?.contains(hit));
    let mode = 'popup';
    if (sheet) {
      mode = rect.right < window.innerWidth - 80 ? 'side' : 'bottom';
    }
    return {
      inside,
      closeOk,
      closeWidth: Math.round(closeRect?.width ?? 0),
      closeHeight: Math.round(closeRect?.height ?? 0),
      mode,
    };
  });
}

async function pinState(page: Page, id: string) {
  return page.evaluate((pinId) => {
    const map = window.__historyMap;
    const pin = document.querySelector<HTMLElement>(`.pin[data-id="${pinId}"]`);
    if (!pin) return { clear: false, reason: 'missing' };
    const rect = pin.getBoundingClientRect();
    if (rect.width < 2) return { clear: false, reason: 'zero' };
    const lng = Number(pin.dataset.lng);
    const lat = Number(pin.dataset.lat);
    const projected = map.project([lng, lat]);
    const back = map.unproject([projected.x, projected.y]);
    const lngDelta = Math.abs((((back.lng - lng) % 360) + 540) % 360 - 180);
    if (lngDelta >= 1.5 || Math.abs(back.lat - lat) >= 1.5) return { clear: false, reason: 'far' };
    if (rect.left < 0 || rect.top < 0 || rect.right > window.innerWidth || rect.bottom > window.innerHeight) {
      return { clear: false, reason: 'offscreen' };
    }
    const obstacles = ['.event-sheet:not([hidden])', '.maplibregl-popup', '.time', '.zoom', '.key-wrap', '.maplibregl-ctrl-attrib', '.wordmark'];
    for (const selector of obstacles) {
      const control = document.querySelector(selector)?.getBoundingClientRect();
      if (!control || control.width < 2 || control.height < 2) continue;
      const hit = rect.left < control.right && rect.right > control.left && rect.top < control.bottom && rect.bottom > control.top;
      if (hit) return { clear: false, reason: selector };
    }
    return { clear: true, reason: '' };
  }, id);
}

async function routeVisibility(page: Page) {
  return page.evaluate(async () => {
    const map = window.__historyMap;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const obstacles = ['.event-sheet:not([hidden])', '.maplibregl-popup', '.time', '.zoom', '.key-wrap', '.maplibregl-ctrl-attrib', '.wordmark']
      .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
      .filter((rect): rect is DOMRect => !!rect && rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.top < height);
    const blocked = (point: { x: number; y: number }) =>
      obstacles.some((rect) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom);
    const facingCamera = (coord: [number, number]) => {
      const projected = map.project(coord);
      if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return false;
      const back = map.unproject([projected.x, projected.y]);
      const lngDelta = Math.abs((((back.lng - coord[0]) % 360) + 540) % 360 - 180);
      return lngDelta < 1.5 && Math.abs(back.lat - coord[1]) < 1.5;
    };
    const onScreen = (point: { x: number; y: number }) => point.x >= 0 && point.y >= 0 && point.x <= width && point.y <= height;
    const rendered = (point: { x: number; y: number }, layer: string) =>
      map.queryRenderedFeatures([[point.x - 10, point.y - 10], [point.x + 10, point.y + 10]], { layers: [layer] }).length > 0;
    const miss = (coord: [number, number], layer: string) => {
      if (!facingCamera(coord)) return 'far';
      const point = map.project(coord);
      if (!onScreen(point)) return 'off';
      const cover = obstacles.find((rect) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom);
      if (cover) return `cover ${Math.round(point.x)},${Math.round(point.y)}`;
      if (!rendered(point, layer)) return `draw ${Math.round(point.x)},${Math.round(point.y)}`;
      return '';
    };
    const densify = (coordinates: [number, number][]) => {
      const samples: [number, number][] = [];
      if (coordinates.length === 0) return samples;
      samples.push(coordinates[0]);
      for (let index = 1; index < coordinates.length; index += 1) {
        const start = coordinates[index - 1];
        const end = coordinates[index];
        const steps = Math.max(1, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / 1.5));
        for (let step = 1; step <= steps; step += 1) {
          const t = step / steps;
          samples.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]);
        }
      }
      return samples;
    };
    const data = await map.getSource('migration').getData();
    let total = 0;
    let shown = 0;
    let heads = 0;
    let headsClear = 0;
    let headMiss = '';
    for (const feature of data.features ?? []) {
      const role = feature.properties?.role;
      const geometry = feature.geometry;
      if (role === 'line' && geometry?.type === 'LineString' && Array.isArray(geometry.coordinates)) {
        for (const coord of densify(geometry.coordinates as [number, number][])) {
          total += 1;
          if (!miss(coord, 'migration-line')) shown += 1;
        }
      }
      if (role === 'head' && geometry?.type === 'Point' && Array.isArray(geometry.coordinates)) {
        heads += 1;
        const why = miss(geometry.coordinates as [number, number], 'migration-head');
        if (!why) headsClear += 1;
        else headMiss = why;
      }
    }
    return { pct: total === 0 ? 0 : shown / total, heads, headsClear, headMiss };
  });
}

async function blackEdge(page: Page) {
  const png = await page.screenshot();
  return page.evaluate(async (b64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) return 0;
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
    const isHole = (x: number, y: number) => {
      const offset = (y * width + x) * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const background = Math.abs(red - 18) <= 4 && Math.abs(green - 23) <= 4 && Math.abs(blue - 28) <= 4;
      return background || (red <= 10 && green <= 10 && blue <= 10);
    };
    const isPaper = (x: number, y: number) => {
      const offset = (y * width + x) * 4;
      return data[offset] > 220 && data[offset + 1] > 210 && data[offset + 2] > 190;
    };
    const columns = new Map<number, number[]>();
    for (let y = 0; y < height; y += 1) {
      let previous = isHole(0, y);
      for (let x = 1; x < width; x += 1) {
        const current = isHole(x, y);
        if (current !== previous) {
          const edge = current ? x - 1 : x;
          const mapX = previous ? x : x - 1;
          const onMap = mapX >= 0 && mapX < width && !isHole(mapX, y) && !isPaper(mapX, y);
          const holeOffset = (y * width + edge) * 4;
          const mapOffset = (y * width + mapX) * 4;
          const contrast = Math.abs(data[holeOffset] - data[mapOffset]) + Math.abs(data[holeOffset + 1] - data[mapOffset + 1]) + Math.abs(data[holeOffset + 2] - data[mapOffset + 2]);
          if (onMap && contrast >= 48 && edge > 6 && edge < width - 7) {
            const rows = columns.get(edge) ?? [];
            rows.push(y);
            columns.set(edge, rows);
          }
        }
        previous = current;
      }
    }
    let straight = 0;
    columns.forEach((rows) => {
      let run = 1;
      for (let index = 1; index < rows.length; index += 1) {
        if (rows[index] === rows[index - 1] + 1) run += 1;
        else {
          if (run > straight) straight = run;
          run = 1;
        }
      }
      if (run > straight) straight = run;
    });
    return straight;
  }, png.toString('base64'));
}

function ignorableConsole(text: string): boolean {
  if (/Worker failed to load/i.test(text)) return false;
  if (/gibs\.earthdata\.nasa\.gov/i.test(text)) return true;
  return /^Failed to load resource: /i.test(text) && !/127\.0\.0\.1|\/assets\//.test(text);
}

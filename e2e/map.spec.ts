import { expect, type Page, test } from '@playwright/test';

declare global {
  interface Window {
    __historyMap: {
      getZoom: () => number;
      getProjection: () => { type: string };
      isMoving: () => boolean;
      isSourceLoaded: (id: string) => boolean;
      jumpTo: (options: { center: [number, number]; zoom: number }) => void;
      once: (type: string, listener: () => void) => void;
      queryRenderedFeatures: (options: { layers: string[] }) => unknown[];
    };
  }
}
import fs from 'node:fs';
import path from 'node:path';

const shots = path.join('test-results', 'screenshots');
const APP_ORIGIN = 'http://127.0.0.1:4173';

/** 1911 is inside 1900–1949 (26 events, including Scott). 1960 is inside 1950–1999 (39). */
const PINS_1900 = 26;
const PINS_1950 = 39;

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
    const url = response.url();
    if (!isAppAsset(url)) return;
    faults.push(`http ${response.status()}: ${url}`);
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!isAppAsset(url)) return;
    faults.push(`failed: ${url} ${request.failure()?.errorText ?? ''}`);
  });
});

test.afterEach(() => {
  expect(faults, faults.join('\n')).toEqual([]);
});

test('timeline, globe, pins, and labels', async ({ page }, testInfo) => {
  const name = testInfo.project.name;
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  await page
    .waitForResponse((response) => response.url().includes('gibs.earthdata.nasa.gov') && response.ok(), {
      timeout: 20_000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(600);
  await expectNoHorizontalScroll(page);
  await expect(page.locator('.maplibregl-ctrl-attrib')).toBeVisible();
  const attributionClear = await page.evaluate(() => {
    const attrib = document.querySelector('.maplibregl-ctrl-attrib')?.getBoundingClientRect();
    const time = document.querySelector('.time')?.getBoundingClientRect();
    if (!attrib || !time) return false;
    return attrib.bottom <= time.top + 1;
  });
  expect(attributionClear).toBe(true);
  await shot(page, `${name}_globe_default`);
  await shot(page, `${name}_attribution`);

  await page.getByRole('button', { name: 'Key' }).click();
  await expect(page.locator('#key-panel')).toBeVisible();
  await expect(page.locator('#key-panel')).toContainText('History');
  await expect(page.locator('#key-panel')).toContainText('Myth');
  await shot(page, `${name}_key_open`);
  await page.getByRole('button', { name: 'Key' }).click();
  await expect(page.locator('#key-panel')).toBeHidden();

  await page.locator('#period-button').click();
  await page.locator('#date-input').fill('1066');
  await shot(page, `${name}_date_input`);
  await page.locator('#date-popout').evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.locator('#period-button')).toHaveText('1050–1099 CE');

  await centerOn(page, 'hastings');
  await page.locator('.pin[data-id="hastings"]').click();
  const popup = page.locator('.maplibregl-popup');
  await expect(popup).toContainText('Norman conquest');
  await expect(popup.locator('.popup-date')).toHaveText('1066 CE');
  await expect(popup).toContainText('Hastings');
  await expect(popup.locator('.popup-summary')).not.toBeEmpty();
  await shot(page, `${name}_historic_popup`);

  await centerOn(page, 'hastings');
  const zoomedFrom = await zoomOf(page);
  for (let i = 0; i < 4; i += 1) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
  }
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(zoomedFrom + 2);
  await expect(page.locator('.pin[data-id="hastings"] .pin-label')).toHaveClass(/is-on/);
  await expect(page.locator('.pin-label.is-on').first()).toBeVisible();
  await shot(page, `${name}_zoomed_labels`);

  const beforeOut = await zoomOf(page);
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(() => zoomOf(page)).toBeLessThan(beforeOut);

  await page.locator('.maplibregl-popup-close-button').click();
  await expect(page.locator('.maplibregl-popup')).toBeHidden();

  if (name === 'desktop') {
    const beforeWheel = await zoomOf(page);
    await page.locator('#map canvas').hover({ position: { x: 220, y: 180 } });
    await page.mouse.wheel(0, -400);
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(beforeWheel);
  } else {
    const beforePinch = await zoomOf(page);
    await pinchOut(page);
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(beforePinch);
  }

  await openDate(page, '60000 BCE');
  await expect(page.locator('#period-button')).toContainText('BCE');
  await centerOn(page, 'out-of-africa');
  await page.locator('.pin[data-id="out-of-africa"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-arrow', 'out-of-africa');
  await expect(page.locator('.maplibregl-popup')).toContainText('Out of Africa');
  await expect(page.locator('.popup-note')).toContainText('Approximate');
  await page.waitForTimeout(1000);
  await shot(page, `${name}_prehistory_out_of_africa`);

  const canvas = page.locator('#map canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('missing map canvas');
  await canvas.click({ position: { x: Math.min(48, box.width / 5), y: Math.min(120, box.height / 4) } });
  await expect(page.locator('#app')).toHaveAttribute('data-arrow', '');

  await openDate(page, '753 BCE');
  await centerOn(page, 'rome-founding');
  await page.locator('.pin[data-id="rome-founding"]').click();
  await expect(page.locator('.popup-note')).toContainText('Traditional date');

  await openDate(page, '2100 BCE');
  await centerOn(page, 'gilgamesh');
  await page.locator('.pin[data-id="gilgamesh"]').click();
  await expect(page.locator('.popup-note')).toContainText('Earliest written source');

  await page.getByRole('button', { name: 'Switch era' }).click();
  await page.getByRole('button', { name: 'Before civilisation' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-era', 'before');
  await page.locator('#slider').evaluate((el: HTMLInputElement) => {
    el.value = '0';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#period-button')).toHaveText('300,000–295,001 BCE');
  await page.locator('#slider').evaluate((el: HTMLInputElement) => {
    el.value = el.max;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#period-button')).toHaveText('5000–3001 BCE');
  await page.getByRole('button', { name: 'Later' }).click();
  await expect(page.locator('#period-button')).toHaveText('3000–2951 BCE');
  await expect(page.locator('#app')).toHaveAttribute('data-era', 'after');

  await openDate(page, '500 BCE');
  await expect(page.locator('#period-button')).toHaveText('500–451 BCE');
  await openDate(page, '500 BC');
  await expect(page.locator('#period-button')).toHaveText('500–451 BCE');
  await openDate(page, '-500');
  await expect(page.locator('#period-button')).toHaveText('500–451 BCE');
  await openDate(page, '120000 BCE');
  await expect(page.locator('#period-button')).toHaveText('120,000–115,001 BCE');

  await openDate(page, '1066 AD');
  const label = await page.locator('#period-button').innerText();
  await page.getByRole('button', { name: 'Later' }).click();
  await expect(page.locator('#period-button')).not.toHaveText(label);
  await page.getByRole('button', { name: 'Earlier' }).click();
  await expect(page.locator('#period-button')).toHaveText(label);

  await page.locator('#slider').evaluate((el: HTMLInputElement) => {
    el.value = '10';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#period-button')).not.toHaveText(label);

  await expectNoHorizontalScroll(page);
  const defaultLabels = await page.evaluate(() => {
    window.__historyMap.jumpTo({ center: [18, 12], zoom: 1.2 });
    return document.querySelectorAll('.pin-label.is-on').length;
  });
  expect(defaultLabels).toBe(0);

  await page.locator('#period-button').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#date-popout')).toBeHidden();
});

test('pins render when basemap tiles are blocked', async ({ page }, testInfo) => {
  await page.route(/gibs\.earthdata\.nasa\.gov/, (route) => route.abort('internetdisconnected'));
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor({ timeout: 20_000 });
  await expect.poll(async () => page.locator('.pin').count()).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__historyMap.getProjection().type)).toBe('globe');
  await expect.poll(() => renderedCount(page, 'land')).toBeGreaterThan(0);
  await shot(page, `${testInfo.project.name}_land_tiles_blocked`);
});

test('production build loads the maplibre worker', async ({ page }) => {
  const workerStatuses: number[] = [];
  page.on('response', (response) => {
    if (/worker/i.test(response.url())) workerStatuses.push(response.status());
  });
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  await expect.poll(() => page.evaluate(() => window.__historyMap.isSourceLoaded('land'))).toBe(true);
  await expect.poll(() => renderedCount(page, 'land')).toBeGreaterThan(0);
  expect(workerStatuses.some((status) => status === 200)).toBe(true);
});

test('covered pins do not take clicks or labels', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  await openDate(page, '1970');
  await page.evaluate(() => {
    window.__historyMap.jumpTo({ center: [-0.21, 5.56], zoom: 1.35 });
  });
  await page.waitForTimeout(500);
  await page.waitForFunction(() => document.querySelectorAll('.pin.maplibregl-marker-covered').length > 0);
  const faulty = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.pin.maplibregl-marker-covered')].filter((pin) => {
      const style = getComputedStyle(pin);
      const labelOn = pin.querySelector('.pin-label')?.classList.contains('is-on') ?? false;
      return style.opacity !== '0' || style.pointerEvents !== 'none' || labelOn;
    }).map((pin) => pin.dataset.id),
  );
  expect(faulty).toEqual([]);
  await page.locator('.pin[data-id="ghana-independence"]').click();
  await expect(page.locator('.maplibregl-popup')).toContainText('Independence of Ghana');
  await expect(page.locator('.maplibregl-popup')).not.toContainText('Moruroa');
  await shot(page, `${testInfo.project.name}_no_ghost_pins`);
});

test('popup stays inside the viewport', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  await openDate(page, '1974');
  const width = page.viewportSize()?.width ?? 390;
  const zoom = width < 700 ? 3.2 : 4;
  const shift = width < 700 ? 28 : 55;
  await page.evaluate(
    ({ zoom: nextZoom, shift: nextShift }) => {
      const pin = document.querySelector<HTMLElement>('.pin[data-id="lucy-discovery"]');
      if (!pin) throw new Error('missing lucy');
      window.__historyMap.jumpTo({
        center: [Number(pin.dataset.lng) - nextShift, Number(pin.dataset.lat)],
        zoom: nextZoom,
      });
    },
    { zoom, shift },
  );
  await waitForIdle(page);
  await page.locator('.pin[data-id="lucy-discovery"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-popup', 'in');
  await expectPopupInside(page);
  await expectPopupClearOfControls(page);
  await shot(page, `${testInfo.project.name}_popup_clear`);
});

test('co-located pins can both be reached', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  await openDate(page, '1184 BCE');
  await page.evaluate(() => {
    window.__historyMap.jumpTo({ center: [26.24, 39.96], zoom: 7 });
  });
  const troy = page.locator('.pin[data-id="troy-bronze-age"]');
  const war = page.locator('.pin[data-id="trojan-war"]');
  await expect(troy).toBeVisible();
  await expect(war).toBeVisible();
  const gap = await page.evaluate(() => {
    const a = document.querySelector('.pin[data-id="troy-bronze-age"]')!.getBoundingClientRect();
    const b = document.querySelector('.pin[data-id="trojan-war"]')!.getBoundingClientRect();
    return Math.hypot(a.x - b.x, a.y - b.y);
  });
  expect(gap).toBeGreaterThan(18);
  await war.click();
  await expect(page.locator('.maplibregl-popup')).toContainText('Trojan War');
  await troy.click();
  await expect(page.locator('.maplibregl-popup')).toContainText('Bronze Age Troy');
  await shot(page, `${testInfo.project.name}_offset_pins`);
});

test('visiting 1911 then 1960 shows each period pin count', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  await openDate(page, '1911');
  await expect(page.locator('#period-button')).toHaveText('1900–1949 CE');
  await expect.poll(() => page.locator('.pin').count()).toBe(PINS_1900);
  await expect(page.locator('.pin[data-id="scott-pole"]')).toHaveCount(1);
  await expect(page.locator('.pin[data-id="amundsen-pole"]')).toHaveCount(1);
  await page.evaluate(() => {
    window.__historyMap.jumpTo({ center: [0.2, -78], zoom: 3 });
  });
  await waitForIdle(page);
  await expect(page.locator('.pin[data-id="scott-pole"]')).toBeVisible();
  await shot(page, `${testInfo.project.name}_scott_1911`);

  await openDate(page, '1960');
  await expect(page.locator('#period-button')).toHaveText('1950–1999 CE');
  await expect.poll(() => page.locator('.pin').count()).toBe(PINS_1950);
  await expect(page.locator('.pin[data-id="scott-pole"]')).toHaveCount(0);
  await page.evaluate((count) => {
    const note = document.createElement('p');
    note.id = 'shot-note';
    note.textContent = `${count} pins`;
    note.style.cssText =
      'position:fixed;z-index:8;top:16px;left:50%;transform:translateX(-50%);margin:0;padding:6px 12px;border-radius:999px;background:#f7f4ee;color:#1c1916;font:600 14px/1.2 Georgia,serif';
    document.body.appendChild(note);
  }, PINS_1950);
  await shot(page, `${testInfo.project.name}_1960_after_1911`);
});

test('movement arrows draw for the slave trade, Zheng He, and Cook', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  const name = testInfo.project.name;
  await showArrow(page, '1700', 'atlantic-slave-trade');
  await expect.poll(() => renderedCount(page, 'migration-line')).toBeGreaterThanOrEqual(2);
  await expect.poll(() => renderedCount(page, 'migration-head')).toBeGreaterThanOrEqual(2);
  await shot(page, `${name}_arrow_slave_trade`);
  await showArrow(page, '1410', 'zheng-he');
  await shot(page, `${name}_arrow_zheng_he`);
  await showArrow(page, '1770', 'cook-pacific');
  expect(await zoomOf(page)).toBeGreaterThanOrEqual(1.6);
  await shot(page, `${name}_arrow_cook`);
  await openDate(page, '13000 BCE');
  await page.evaluate(() => {
    window.__historyMap.jumpTo({ center: [180, 66], zoom: 3.2 });
  });
  await page.waitForTimeout(400);
  await shot(page, `${name}_antimeridian`);
  await page.locator('.pin[data-id="peopling-of-the-americas"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-arrow', 'peopling-of-the-americas');
  await page.waitForTimeout(1000);
  await shot(page, `${name}_antimeridian_arrow`);
});

test('every migration route draws a line', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'checked once on the built desktop map');
  test.setTimeout(180_000);
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  expect(ROUTES).toHaveLength(26);
  for (const route of ROUTES) {
    await showArrow(page, route.date, route.id);
    const lines = await renderedCount(page, 'migration-line');
    expect(lines, route.id).toBeGreaterThan(0);
    if (route.id === 'atlantic-slave-trade') {
      expect(await renderedCount(page, 'migration-head'), route.id).toBeGreaterThanOrEqual(2);
    }
  }
});

async function showArrow(page: Page, date: string, id: string) {
  await openDate(page, date);
  await centerOn(page, id);
  await page.locator(`.pin[data-id="${id}"]`).click();
  await expect(page.locator('#app')).toHaveAttribute('data-arrow', id);
  await expect(page.locator('#app')).toHaveAttribute('data-popup', 'in');
  await waitForIdle(page);
  await expect.poll(() => renderedCount(page, 'migration-line')).toBeGreaterThan(0);
}

async function renderedCount(page: Page, layer: string) {
  return page.evaluate((layerId) => window.__historyMap.queryRenderedFeatures({ layers: [layerId] }).length, layer);
}

async function waitForIdle(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    const map = window.__historyMap;
    if (!map.isMoving()) resolve();
    else map.once('idle', () => resolve());
  }));
}

async function expectPopupClearOfControls(page: Page) {
  const overlap = await page.evaluate(() => {
    const popup = document.querySelector('.maplibregl-popup')?.getBoundingClientRect();
    if (!popup) return ['missing popup'];
    return ['.zoom', '.key-wrap', '.time'].flatMap((selector) => {
      const control = document.querySelector(selector)?.getBoundingClientRect();
      if (!control || control.width < 2) return [];
      const hit =
        popup.left < control.right && popup.right > control.left && popup.top < control.bottom && popup.bottom > control.top;
      return hit ? [selector] : [];
    });
  });
  expect(overlap).toEqual([]);
}

async function expectPopupInside(page: Page) {
  const box = await page.locator('.maplibregl-popup').boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('missing popup box');
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function openDate(page: Page, value: string) {
  if (await page.locator('#date-popout').isHidden()) {
    await page.locator('#period-button').click();
  }
  await page.locator('#date-input').fill(value);
  await page.locator('#date-popout').evaluate((form: HTMLFormElement) => form.requestSubmit());
}

async function centerOn(page: Page, id: string) {
  await page.evaluate((eventId) => {
    const pin = document.querySelector<HTMLElement>(`.pin[data-id="${eventId}"]`);
    if (!pin) throw new Error(`missing pin ${eventId}`);
    window.__historyMap.jumpTo({
      center: [Number(pin.dataset.lng), Number(pin.dataset.lat)],
      zoom: 2.4,
    });
  }, id);
  await page.locator(`.pin[data-id="${id}"]`).waitFor({ state: 'visible' });
}

async function zoomOf(page: Page) {
  return page.evaluate(() => window.__historyMap.getZoom());
}

async function shot(page: Page, fileName: string) {
  await page.screenshot({ path: path.join(shots, `built_${fileName}.png`) });
}

function isAppAsset(url: string): boolean {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function ignorableConsole(text: string): boolean {
  if (/Worker failed to load/i.test(text)) return false;
  if (/gibs\.earthdata\.nasa\.gov/i.test(text)) return true;
  return /^Failed to load resource: the server responded with a status of \d+/i.test(text);
}

async function expectNoHorizontalScroll(page: Page) {
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth + 1);
}

async function pinchOut(page: Page) {
  const box = await page.locator('#map canvas').boundingBox();
  if (!box) throw new Error('missing map canvas');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const session = await page.context().newCDPSession(page);
  const start = 36;
  const end = 90;
  const steps = 8;
  const point = (distance: number, id: number, xSign: number) => ({
    x: cx + xSign * distance,
    y: cy,
    id,
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(start, 1, -1), point(start, 2, 1)],
  });
  for (let i = 1; i <= steps; i += 1) {
    const distance = start + ((end - start) * i) / steps;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [point(distance, 1, -1), point(distance, 2, 1)],
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

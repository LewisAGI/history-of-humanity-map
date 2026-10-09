import { expect, type Page, test } from '@playwright/test';

declare global {
  interface Window {
    __historyMap: {
      getZoom: () => number;
      getProjection: () => { type: string };
      isMoving: () => boolean;
      loaded: () => boolean;
      areTilesLoaded: () => boolean;
      isSourceLoaded: (id: string) => boolean;
      jumpTo: (options: { center: [number, number]; zoom: number }) => void;
      once: (type: string, listener: () => void) => void;
      project: (lngLat: [number, number]) => { x: number; y: number };
      getSource: (id: string) => { getData: () => Promise<{ features?: { properties?: { role?: string }; geometry?: { type?: string; coordinates?: unknown } }[] }> };
      unproject: (point: [number, number]) => { lng: number; lat: number };
      queryRenderedFeatures: (
        geometryOrOptions?: [[number, number], [number, number]] | { layers: string[] },
        options?: { layers: string[] },
      ) => { geometry?: { coordinates: [number, number] }; layer?: { id: string } }[];
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
  const popup = eventCard(page);
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

  await page.locator('.maplibregl-popup-close-button, .event-sheet:not([hidden]) .sheet-close').click();
  await expect(eventCard(page)).toHaveCount(0);

  if (name === 'desktop') {
    const beforeWheel = await zoomOf(page);
    await page.locator('#map canvas').hover({ position: { x: 220, y: 180 } });
    await page.mouse.wheel(0, -400);
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(beforeWheel);
  } else if (name !== 'landscape-webkit') {
    const beforePinch = await zoomOf(page);
    await pinchOut(page);
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(beforePinch);
  }

  await openDate(page, '60000 BCE');
  await expect(page.locator('#period-button')).toContainText('BCE');
  await centerOn(page, 'out-of-africa');
  await page.locator('.pin[data-id="out-of-africa"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-arrow', 'out-of-africa');
  await expect(eventCard(page)).toContainText('Out of Africa');
  await expect(page.locator('.popup-note')).toContainText('Approximate');
  await page.waitForTimeout(1000);
  await shot(page, `${name}_prehistory_out_of_africa`);

  const canvas = page.locator('#map canvas');
  const clickAt = await page.evaluate(() => {
    const mapCanvas = document.querySelector('#map canvas');
    for (let x = 24; x < window.innerWidth - 16; x += 20) {
      for (const y of [72, 120, 180, 240]) {
        if (y > window.innerHeight - 16) continue;
        if (document.elementFromPoint(x, y) === mapCanvas) return { x, y };
      }
    }
    return { x: Math.floor(window.innerWidth * 0.72), y: Math.floor(window.innerHeight * 0.4) };
  });
  await canvas.click({ position: clickAt });
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
  await expect(eventCard(page)).toContainText('Independence of Ghana');
  await expect(eventCard(page)).not.toContainText('Moruroa');
  await shot(page, `${testInfo.project.name}_no_ghost_pins`);
});

test('popup stays inside the viewport', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  await openDate(page, '1974');
  const size = page.viewportSize();
  const width = size?.width ?? 390;
  const shortViewport = width < 700 || (size?.height ?? 900) <= 500;
  const zoom = shortViewport ? 3.2 : 4;
  const shift = shortViewport ? 28 : 55;
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
  await expect(eventCard(page)).toContainText('Trojan War');
  await troy.click();
  await expect(eventCard(page)).toContainText('Bronze Age Troy');
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
  const tallEnough = (page.viewportSize()?.height ?? 900) > 500;
  await page.evaluate((nextZoom) => {
    window.__historyMap.jumpTo({ center: [0.2, -78], zoom: nextZoom });
  }, tallEnough ? 1.8 : 1.2);
  await waitForIdle(page);
  await expect(page.locator('.pin[data-id="scott-pole"]')).toBeVisible();
  if (tallEnough) {
    await expect.poll(async () => page.evaluate(() => {
      const pin = document.querySelector('.pin[data-id="scott-pole"]')!.getBoundingClientRect();
      const time = document.querySelector('.time')!.getBoundingClientRect();
      return pin.width > 2 && pin.bottom <= time.top - 1 && pin.top >= 0;
    })).toBe(true);
    await page.locator('.pin[data-id="scott-pole"]').click();
  } else {
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('.pin[data-id="scott-pole"]')!.click());
  }
  await expect(page.locator('#app')).toHaveAttribute('data-popup', 'in');
  await waitForIdle(page);
  await page.waitForTimeout(900);
  if (tallEnough) {
    const aboveTime = await page.evaluate(() => {
      const pin = document.querySelector('.pin[data-id="scott-pole"]')!.getBoundingClientRect();
      const time = document.querySelector('.time')!.getBoundingClientRect();
      return pin.width > 2 && pin.bottom <= time.top - 1 && pin.top >= 0 && pin.right <= window.innerWidth;
    });
    expect(aboveTime).toBe(true);
  }
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
  await expect.poll(async () => (await renderedRoute(page)).lines).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await renderedRoute(page)).heads).toBeGreaterThanOrEqual(2);
  await shot(page, `${name}_arrow_slave_trade`);
  await showArrow(page, '1410', 'zheng-he');
  await shot(page, `${name}_arrow_zheng_he`);
  await showArrow(page, '1770', 'cook-pacific');
  const framed = page.viewportSize();
  if ((framed?.width ?? 0) > 600 && (framed?.height ?? 0) > 500) {
    expect(await zoomOf(page)).toBeGreaterThanOrEqual(1.6);
  }
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

test('phone routes stay visible beside the open popup', async ({ page }, testInfo) => {
  test.skip(
    !['iphone', 'landscape', 'landscape-webkit'].includes(testInfo.project.name),
    'the sheet is the short-viewport layout',
  );
  test.setTimeout(240_000);
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  const results: { id: string; pct: number; heads: number; headsClear: number }[] = [];
  for (const route of ROUTES) {
    await showArrow(page, route.date, route.id);
    await page.waitForTimeout(300);
    const vis = await routeVisibility(page);
    results.push({ id: route.id, pct: vis.pct, heads: vis.heads, headsClear: vis.headsClear });
    await expectSheetReadable(page, route.id);
    await expectPopupClearOfControls(page);
    await expectNoBlackHole(page);
    if (['zheng-he', 'out-of-africa', 'atlantic-slave-trade', 'cook-pacific'].includes(route.id)) {
      await shot(page, `${testInfo.project.name}_${route.id}_sheet`);
    }
  }
  const table = results.map((item) => `${item.id} ${Math.round(item.pct * 100)}% heads ${item.headsClear}/${item.heads}`).join('\n');
  fs.writeFileSync(`/tmp/routes-${testInfo.project.name}.txt`, `${table}\n`);
  console.log(table);
  const hidden = results.filter((item) => item.pct < 0.5 || item.heads < 1 || item.headsClear !== item.heads);
  expect(hidden).toEqual([]);
  await showArrow(page, '1410', 'zheng-he');
  await page.locator('.maplibregl-popup-close-button, .sheet-close').click();
  await expect(page.locator('#app')).toHaveAttribute('data-arrow', 'zheng-he');
  await expect.poll(async () => (await renderedRoute(page)).lines).toBeGreaterThan(0);
  await shot(page, `${testInfo.project.name}_zheng_he_after_close`);
});

test('Qesem Cave stays on screen', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  await openDate(page, '300000 BCE');
  await page.evaluate(() => {
    window.__historyMap.jumpTo({ center: [18, 12], zoom: 0.9 });
  });
  await waitForIdle(page);
  await page.locator('.pin[data-id="qesem-fire"]').click({ force: true });
  await expect(page.locator('#app')).toHaveAttribute('data-popup', 'in');
  await waitForIdle(page);
  await page.waitForTimeout(1000);
  await expectPopupInside(page);
  await expectPopupClearOfControls(page);
  if (usesSheet(page)) {
    await expect(page.locator('.event-sheet:not([hidden])')).toBeVisible();
    await expect(page.locator('.maplibregl-popup')).toHaveCount(0);
    await expectSheetReadable(page, 'qesem-fire');
  }
  await shot(page, `${testInfo.project.name}_qesem`);
});

test('Tiananmen stays on screen', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  await openDate(page, '1960');
  await page.evaluate(() => {
    window.__historyMap.jumpTo({ center: [100, 20], zoom: 1.2 });
  });
  await waitForIdle(page);
  await page.locator('.pin[data-id="tiananmen-1989"]').click({ force: true });
  await expect(page.locator('#app')).toHaveAttribute('data-popup', 'in');
  await waitForIdle(page);
  await page.waitForTimeout(1000);
  await expectPopupInside(page);
  await expectPopupClearOfControls(page);
  if (usesSheet(page)) {
    await expect(page.locator('.event-sheet:not([hidden])')).toBeVisible();
    await expect(page.locator('.maplibregl-popup')).toHaveCount(0);
    await expectSheetReadable(page, 'tiananmen-1989');
  }
  await shot(page, `${testInfo.project.name}_tiananmen`);
});

test('Trail of Tears and Sequoyah can both be reached', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  await openDate(page, '1830');
  await page.evaluate(() => {
    window.__historyMap.jumpTo({ center: [-84.45, 35.485], zoom: 3.5 });
  });
  await waitForIdle(page);
  const trail = page.locator('.pin[data-id="trail-of-tears"]');
  const sequoyah = page.locator('.pin[data-id="sequoyah"]');
  await expect(trail).toBeVisible();
  await expect(sequoyah).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const a = document.querySelector('.pin[data-id="trail-of-tears"]')!.getBoundingClientRect();
    const b = document.querySelector('.pin[data-id="sequoyah"]')!.getBoundingClientRect();
    return Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2));
  })).toBeGreaterThan(18);
  await sequoyah.click();
  await expect(eventCard(page)).toContainText('Sequoyah');
  await trail.click();
  await expect(eventCard(page)).toContainText('Indian Removal');
  await shot(page, `${testInfo.project.name}_trail_sequoyah`);
});

test('zooming in on Antarctica in 1911 stays zoomed in', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough to catch the pole lock');
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  await openDate(page, '1911');
  await page.evaluate(() => {
    window.__historyMap.jumpTo({ center: [60, -72], zoom: 1.6 });
  });
  await waitForIdle(page);
  for (let i = 0; i < 4; i += 1) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await waitForIdle(page);
  }
  await expect.poll(() => zoomOf(page)).toBeGreaterThanOrEqual(5);
  await page.waitForTimeout(800);
  expect(await zoomOf(page)).toBeGreaterThanOrEqual(5);
  await shot(page, `${testInfo.project.name}_1911_zoomed`);
});

test('Scott and Amundsen labels can both show', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the pole labels are not a phone layout');
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  await openDate(page, '1911');
  await page.evaluate(() => {
    window.__historyMap.jumpTo({ center: [0.15, -78], zoom: 2.2 });
  });
  await waitForIdle(page);
  await expect(page.locator('.pin[data-id="scott-pole"] .pin-label')).toHaveClass(/is-on/);
  await expect(page.locator('.pin[data-id="amundsen-pole"] .pin-label')).toHaveClass(/is-on/);
});

test('a desktop popup stays under the wordmark after zoom', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop popups are the floating card');
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  await openDate(page, '1066');
  await centerOn(page, 'hastings');
  await page.locator('.pin[data-id="hastings"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-popup', 'in');
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await waitForIdle(page);
  }
  await expectPopupClearOfControls(page);
  const placed = await page.evaluate(() => {
    const pin = document.querySelector('.pin[data-id="hastings"]')!.getBoundingClientRect();
    const popup = document.querySelector('.maplibregl-popup')!.getBoundingClientRect();
    const style = getComputedStyle(document.querySelector('.maplibregl-popup')!);
    const near =
      popup.top < pin.bottom + 36 &&
      popup.bottom > pin.top - 36 &&
      popup.left < pin.right + 80 &&
      popup.right > pin.left - 80;
    return {
      near,
      marginTop: Math.abs(parseFloat(style.marginTop) || 0),
      marginLeft: Math.abs(parseFloat(style.marginLeft) || 0),
    };
  });
  expect(placed.near).toBe(true);
  expect(placed.marginTop).toBeLessThanOrEqual(48);
  expect(placed.marginLeft).toBeLessThanOrEqual(48);
});

test('the sheet close button stays clear of zoom on a short phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'the short viewports reuse the phone browser');
  for (const viewport of [
    { width: 375, height: 553 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('#app[data-ready="true"]').waitFor();
    await openDate(page, '1405');
    await centerOn(page, 'zheng-he', 2);
    await page.locator('.pin[data-id="zheng-he"]').click();
    await expect(page.locator('.event-sheet:not([hidden])')).toBeVisible();
    await expect(page.locator('#app')).toHaveAttribute('data-popup', 'in');
    await expectSheetReadable(page, `zheng-he-${viewport.width}`);
    const hit = await page.evaluate(() => {
      const close = document.querySelector('.sheet-close');
      if (!close) return 'missing';
      const rect = close.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return target?.closest('.sheet-close') ? 'sheet-close' : target?.id || target?.className || 'other';
    });
    expect(hit, `${viewport.width}x${viewport.height}`).toBe('sheet-close');
    await expectPopupClearOfControls(page);
    await shot(page, `${testInfo.project.name}_${viewport.width}x${viewport.height}_sheet`);
    const before = await zoomOf(page);
    await page.locator('.sheet-close').click();
    await expect(page.locator('.event-sheet:not([hidden])')).toHaveCount(0);
    expect(await zoomOf(page)).toBeGreaterThan(before - 0.05);
  }
});

test('escape closes the popup and keeps the route', async ({ page }) => {
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  await showArrow(page, '1410', 'zheng-he');
  await page.keyboard.press('Escape');
  await expect(eventCard(page)).toHaveCount(0);
  await expect(page.locator('#app')).toHaveAttribute('data-arrow', 'zheng-he');
  await expect.poll(async () => (await renderedRoute(page)).lines).toBeGreaterThan(0);
});

test('every migration route draws a line', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.locator('#app[data-ready="true"]').waitFor();
  expect(ROUTES).toHaveLength(26);
  for (const route of ROUTES) {
    await showArrow(page, route.date, route.id);
    const drawn = await renderedRoute(page);
    expect(drawn.lines, route.id).toBeGreaterThan(0);
    if (route.id === 'atlantic-slave-trade') {
      expect(drawn.heads, route.id).toBeGreaterThanOrEqual(2);
      expect(drawn.lines, route.id).toBeGreaterThanOrEqual(2);
    }
  }
});

async function showArrow(page: Page, date: string, id: string) {
  await openDate(page, date);
  await centerOn(page, id, 7.5);
  await page.locator(`.pin[data-id="${id}"]`).click();
  await expect(page.locator('#app')).toHaveAttribute('data-arrow', id);
  await expect(page.locator('#app')).toHaveAttribute('data-popup', 'in');
  await waitForIdle(page);
  await expect.poll(async () => (await renderedRoute(page)).lines).toBeGreaterThan(0);
}

/** Arrowheads in view, and a drawn line within a few pixels of each head. */
async function renderedRoute(page: Page) {
  return page.evaluate(() => {
    const map = window.__historyMap;
    const heads = map.queryRenderedFeatures({ layers: ['migration-head'] });
    const lines = heads.reduce((sum, head) => {
      const coordinates = head.geometry?.coordinates;
      if (!coordinates) return sum;
      const point = map.project(coordinates);
      const hits = map.queryRenderedFeatures(
        [
          [point.x - 14, point.y - 14],
          [point.x + 14, point.y + 14],
        ],
        { layers: ['migration-line'] },
      );
      return sum + (hits.length > 0 ? 1 : 0);
    }, 0);
    return { heads: heads.length, lines };
  });
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

async function routeVisibility(page: Page) {
  return page.evaluate(async () => {
    const map = window.__historyMap;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const obstacles = [
      '.event-sheet:not([hidden])',
      '.maplibregl-popup',
      '.time',
      '.zoom',
      '.key-wrap',
      '.maplibregl-ctrl-attrib',
      '.wordmark',
    ]
      .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
      .filter((rect): rect is DOMRect => !!rect && rect.width > 2 && rect.height > 2);
    const blocked = (point: { x: number; y: number }) =>
      obstacles.some((rect) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom);
    const facingCamera = (coord: [number, number]) => {
      const projected = map.project(coord);
      if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return false;
      const back = map.unproject([projected.x, projected.y]);
      const lngDelta = Math.abs((((back.lng - coord[0]) % 360) + 540) % 360 - 180);
      return lngDelta < 1.5 && Math.abs(back.lat - coord[1]) < 1.5;
    };
    const onScreen = (point: { x: number; y: number }) =>
      point.x >= 0 && point.y >= 0 && point.x <= width && point.y <= height;
    const rendered = (point: { x: number; y: number }, layer: string) =>
      map.queryRenderedFeatures(
        [
          [point.x - 10, point.y - 10],
          [point.x + 10, point.y + 10],
        ],
        { layers: [layer] },
      ).length > 0;
    const visiblePoint = (coord: [number, number], layer: string) => {
      if (!facingCamera(coord)) return false;
      const point = map.project(coord);
      if (!onScreen(point) || blocked(point)) return false;
      return rendered(point, layer);
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
    for (const feature of data.features ?? []) {
      const role = feature.properties?.role;
      const geometry = feature.geometry;
      if (role === 'line' && geometry?.type === 'LineString' && Array.isArray(geometry.coordinates)) {
        for (const coord of densify(geometry.coordinates as [number, number][])) {
          total += 1;
          if (visiblePoint(coord, 'migration-line')) shown += 1;
        }
      }
      if (role === 'head' && geometry?.type === 'Point' && Array.isArray(geometry.coordinates)) {
        heads += 1;
        if (visiblePoint(geometry.coordinates as [number, number], 'migration-head')) headsClear += 1;
      }
    }
    return {
      pct: total === 0 ? 0 : shown / total,
      heads,
      headsClear,
    };
  });
}

function usesSheet(page: Page): boolean {
  const size = page.viewportSize();
  return (size?.width ?? 1000) <= 600 || (size?.height ?? 1000) <= 500;
}

async function expectPopupClearOfControls(page: Page) {
  await waitForIdle(page);
  const overlap = await page.evaluate(() => {
    const popup = document.querySelector('.event-sheet:not([hidden]), .maplibregl-popup')?.getBoundingClientRect();
    if (!popup) return ['missing popup'];
      return ['.zoom', '.key-wrap', '.time', '.maplibregl-ctrl-attrib', '.wordmark'].flatMap((selector) => {
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
  await waitForIdle(page);
  const box = await page.locator('.event-sheet:not([hidden]), .maplibregl-popup').boundingBox();
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

async function centerOn(page: Page, id: string, zoom = 2.4) {
  await page.evaluate(
    ({ eventId, zoom: nextZoom }) => {
      const pin = document.querySelector<HTMLElement>(`.pin[data-id="${eventId}"]`);
      if (!pin) throw new Error(`missing pin ${eventId}`);
      window.__historyMap.jumpTo({
        center: [Number(pin.dataset.lng), Number(pin.dataset.lat)],
        zoom: nextZoom,
      });
    },
    { eventId: id, zoom },
  );
  await page.locator(`.pin[data-id="${id}"]`).waitFor({ state: 'visible' });
}

async function zoomOf(page: Page) {
  return page.evaluate(() => window.__historyMap.getZoom());
}

function eventCard(page: Page) {
  return page.locator('.event-sheet:not([hidden]), .maplibregl-popup');
}

async function expectSheetReadable(page: Page, id: string) {
  const info = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>('.event-sheet:not([hidden])');
    const body = sheet?.querySelector<HTMLElement>('.sheet-body');
    const title = sheet?.querySelector<HTMLElement>('.popup-title');
    const summary = sheet?.querySelector<HTMLElement>('.popup-summary');
    const note = sheet?.querySelector<HTMLElement>('.popup-note') ?? summary;
    if (!sheet || !body || !title || !note || !summary) return null;
    const sheetRect = sheet.getBoundingClientRect();
    const summaryRect = summary.getBoundingClientRect();
    const summaryVisible = summaryRect.top >= sheetRect.top + 4 && summaryRect.top <= sheetRect.bottom - 8;
    body.scrollTop = body.scrollHeight;
    const noteRect = note.getBoundingClientRect();
    const endVisible = noteRect.bottom <= sheetRect.bottom + 1 && noteRect.bottom > sheetRect.top + 4;
    body.scrollTop = 0;
    return {
      left: sheetRect.left,
      right: sheetRect.right,
      width: sheetRect.width,
      viewport: window.innerWidth,
      titleLines: title.getClientRects().length,
      bodyOverflow: getComputedStyle(body).overflowY,
      sheetOverflow: getComputedStyle(sheet).overflowY,
      noteVisible: endVisible,
      summaryVisible,
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
    };
  });
  expect(info, id).not.toBeNull();
  if (!info) return;
  const fullWidth = info.left <= 16 && info.right >= info.viewport - 16;
  if (fullWidth) expect(info.width, id).toBeGreaterThanOrEqual(info.viewport - 32);
  else {
    expect(info.left, id).toBeLessThanOrEqual(16);
    expect(info.width, id).toBeGreaterThanOrEqual(180);
    expect(info.summaryVisible, id).toBe(true);
  }
  expect(info.titleLines, id).toBeGreaterThan(0);
  expect(info.titleLines, id).toBeLessThanOrEqual(3);
  expect(info.bodyOverflow, id).toMatch(/auto|scroll/);
  expect(info.sheetOverflow, id).toBe('hidden');
  expect(info.noteVisible, id).toBe(true);
  expect(info.scrollHeight, id).toBeGreaterThanOrEqual(info.clientHeight);
}

/**
 * The black rectangle is the page background showing through the canvas.
 * It meets the globe on a straight edge. A round limb does not.
 */
async function expectNoBlackHole(page: Page) {
  await waitForPainted(page);
  const png = await page.screenshot();
  const longest = await page.evaluate(async (b64) => {
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
          const contrast = Math.abs(data[holeOffset] - data[mapOffset])
            + Math.abs(data[holeOffset + 1] - data[mapOffset + 1])
            + Math.abs(data[holeOffset + 2] - data[mapOffset + 2]);
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
  expect(longest, 'straight black edge cut into the globe').toBeLessThan(64);
}

async function waitForPainted(page: Page) {
  await waitForIdle(page);
  await page.waitForFunction(
    () => window.__historyMap.loaded() && window.__historyMap.areTilesLoaded(),
    undefined,
    { timeout: 8_000 },
  ).catch(() => undefined);
}

async function shot(page: Page, fileName: string) {
  await waitForPainted(page);
  await page.screenshot({ path: path.join(shots, `r5_${fileName}.png`) });
  await expectNoBlackHole(page);
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
  // Aborted basemap tiles are reported without the tile host. A same-origin
  // asset failure is recorded from the response, and "Worker failed to load" is not ignored.
  return /^Failed to load resource: /i.test(text) && !/127\.0\.0\.1|\/assets\//.test(text);
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

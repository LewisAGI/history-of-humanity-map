import 'maplibre-gl/dist/maplibre-gl.css';
import { formatYearRange, parseDateInput } from './dates';
import { createMap } from './map-view';
import { eventOverlapsPeriod, periodByIndex, periodsForEra, presentYear, resolvePeriod, shiftPeriod } from './timeline';
import type { Era, HistoryEvent, Period } from './types';
import eventsJson from '../data/events.json';

const events = eventsJson as HistoryEvent[];
const present = presentYear();
const PLAY_MS = 1500;

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing #app');

app.innerHTML = `
  <div id="map"></div>
  <p class="wordmark">History of humanity map</p>
  <div class="zoom">
    <button type="button" id="zoom-in" class="icon-button" data-tip="Zoom in" aria-label="Zoom in">${iconPlus()}</button>
    <button type="button" id="zoom-out" class="icon-button" data-tip="Zoom out" aria-label="Zoom out">${iconMinus()}</button>
  </div>
  <div class="key-wrap">
    <button type="button" id="key-button" class="icon-button" data-tip="Key" aria-label="Key" aria-expanded="false">${iconKey()}</button>
    <div id="key-panel" class="popout key-panel" hidden>
      <p class="key-row" data-kind="history" role="img" aria-label="History" data-tip="History"><span class="swatch history"></span></p>
      <p class="key-row" data-kind="myth" role="img" aria-label="Myth" data-tip="Myth"><span class="swatch myth"></span></p>
    </div>
  </div>
  <div class="time">
    <div class="thumb-band">
      <button type="button" id="period-button" class="thumb-label"></button>
      <button type="button" id="tools-button" class="icon-button tools-button" data-tip="Date and era" aria-label="Date and era" aria-expanded="false">${iconDate()}</button>
    </div>
    <div class="time-row">
      <button type="button" id="step-back" class="icon-button" data-tip="Earlier" aria-label="Earlier">${iconChevron('left')}</button>
      <button type="button" id="play" class="icon-button" data-tip="Play" aria-label="Play" aria-pressed="false">${iconPlay()}</button>
      <div class="ruler">
        <div class="ticks" id="ticks" aria-hidden="true"></div>
        <div class="era-labels" id="era-labels" aria-hidden="true"></div>
        <input id="slider" type="range" min="0" step="1" aria-label="Time" />
      </div>
      <button type="button" id="step-forward" class="icon-button" data-tip="Later" aria-label="Later">${iconChevron('right')}</button>
      <button type="button" id="date-button" class="icon-button" data-tip="Date" aria-label="Date" aria-expanded="false">${iconDate()}</button>
      <button type="button" id="era-button" class="icon-button" data-tip="Switch era" aria-label="Switch era" aria-expanded="false">${iconEra()}</button>
    </div>
    <div id="era-popout" class="popout tools-popout" hidden>
      <form id="date-popout">
        <input id="date-input" name="date" aria-label="Date" autocomplete="off" enterkeyhint="go" />
      </form>
      <button type="button" class="era-option" data-era="before" data-tip="Before civilisation" aria-label="Before civilisation">${iconAxe()}</button>
      <button type="button" class="era-option" data-era="after" data-tip="After civilisation" aria-label="After civilisation">${iconTemple()}</button>
    </div>
  </div>
`;

const mapEl = app.querySelector<HTMLElement>('#map')!;
const mapView = createMap(mapEl, app);
const periodButton = app.querySelector<HTMLButtonElement>('#period-button')!;
const slider = app.querySelector<HTMLInputElement>('#slider')!;
const ticks = app.querySelector<HTMLElement>('#ticks')!;
const eraLabels = app.querySelector<HTMLElement>('#era-labels')!;
const toolsButton = app.querySelector<HTMLButtonElement>('#tools-button')!;
const stepBack = app.querySelector<HTMLButtonElement>('#step-back')!;
const stepForward = app.querySelector<HTMLButtonElement>('#step-forward')!;
const playButton = app.querySelector<HTMLButtonElement>('#play')!;
const eraButton = app.querySelector<HTMLButtonElement>('#era-button')!;
const eraPopout = app.querySelector<HTMLElement>('#era-popout')!;
const dateButton = app.querySelector<HTMLButtonElement>('#date-button')!;
const datePopout = app.querySelector<HTMLFormElement>('#date-popout')!;
const dateInput = app.querySelector<HTMLInputElement>('#date-input')!;
const keyButton = app.querySelector<HTMLButtonElement>('#key-button')!;
const keyPanel = app.querySelector<HTMLElement>('#key-panel')!;

let period = resolvePeriod(present, present);
const memory: Partial<Record<Era, Period>> = { after: period };
let selected: HistoryEvent | null = null;
let retainRoute = false;
let playing = false;
let playTimer: ReturnType<typeof setInterval> | null = null;

mapView.onSelect((event) => {
  closePopouts();
  selected = event;
  retainRoute = false;
  render();
});

mapView.onPopupClose(() => {
  closePopouts();
  selected = null;
  retainRoute = true;
  render();
});

app.querySelector<HTMLButtonElement>('#zoom-in')!.addEventListener('click', () => mapView.zoomIn());
app.querySelector<HTMLButtonElement>('#zoom-out')!.addEventListener('click', () => mapView.zoomOut());

stepBack.addEventListener('click', () => {
  applyPeriod(shiftPeriod(period, -1, present));
});
stepForward.addEventListener('click', () => {
  applyPeriod(shiftPeriod(period, 1, present));
});

slider.addEventListener('input', () => {
  applyPeriod(periodByIndex(period.era, Number(slider.value), present));
});

playButton.addEventListener('click', () => {
  if (playing) stopPlayback();
  else startPlayback();
});

eraButton.addEventListener('click', toggleDate);
toolsButton.addEventListener('click', toggleDate);

eraPopout.querySelectorAll<HTMLButtonElement>('[data-era]').forEach((button) => {
  button.addEventListener('click', () => {
    const era = button.dataset.era as Era;
    closePopouts();
    if (era === period.era) return;
    const periods = periodsForEra(era, present);
    const next = memory[era] ?? (era === 'before' ? periods[0] : periods[periods.length - 1]);
    applyPeriod(next);
  });
});

periodButton.addEventListener('click', toggleDate);
dateButton.addEventListener('click', toggleDate);

let pressTimer: ReturnType<typeof setTimeout> | null = null;

function clearLongTip() {
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = null;
  document.querySelectorAll('.is-long-tip').forEach((node) => node.classList.remove('is-long-tip'));
}

document.addEventListener('pointerdown', (event) => {
  clearLongTip();
  const element = event.target instanceof Element ? event.target : null;
  if (!element?.closest('#play')) stopPlayback();
  const pointer = event as PointerEvent;
  const tipHost = element?.closest<HTMLElement>('[data-tip]');
  const fineHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (tipHost && (!fineHover || pointer.pointerType === 'touch')) {
    pressTimer = setTimeout(() => tipHost.classList.add('is-long-tip'), 500);
  }
  if (!element) return;
  if (!eraPopout.hidden && !element.closest('#era-popout, #era-button, #date-button, #tools-button, #period-button')) {
    closePopouts();
  }
  if (!keyPanel.hidden && !element.closest('#key-panel, #key-button')) {
    keyPanel.hidden = true;
    keyButton.setAttribute('aria-expanded', 'false');
  }
});

document.addEventListener('pointerup', clearLongTip);
document.addEventListener('pointercancel', clearLongTip);

document.addEventListener('keydown', (event) => {
  const element = event.target instanceof Element ? event.target : null;
  if (!element?.closest('#play')) stopPlayback();
  if (event.key !== 'Escape') return;
  if (!eraPopout.hidden || !keyPanel.hidden) {
    closePopouts();
    return;
  }
  if (!selected) return;
  selected = null;
  retainRoute = true;
  render();
});

document.addEventListener('wheel', () => stopPlayback(), { passive: true });

datePopout.addEventListener('submit', (event) => {
  event.preventDefault();
  const year = parseDateInput(dateInput.value);
  if (year === null) {
    dateInput.classList.remove('is-invalid');
    void dateInput.offsetWidth;
    dateInput.classList.add('is-invalid');
    return;
  }
  dateInput.classList.remove('is-invalid');
  closePopouts();
  applyPeriod(resolvePeriod(year, present));
});

keyButton.addEventListener('click', () => {
  togglePopout(keyPanel, keyButton);
});

window.addEventListener('resize', refreshRuler);

function applyPeriod(next: Period) {
  period = next;
  memory[next.era] = next;
  selected = null;
  retainRoute = false;
  render({ framePoles: true });
}

function render(options?: { framePoles?: boolean }) {
  const inEra = periodsForEra(period.era, present);
  const visible = events.filter((event) => eventOverlapsPeriod(event, period));
  if (selected && !visible.some((event) => event.id === selected?.id)) selected = null;

  const label = formatYearRange(period.start, period.end);
  periodButton.textContent = label;
  periodButton.setAttribute('aria-label', label);
  slider.max = String(inEra.length - 1);
  slider.value = String(period.index);
  slider.setAttribute('aria-valuetext', spokenRange(label));
  app!.dataset.era = period.era;
  app!.dataset.periodStart = String(period.start);
  app!.dataset.periodEnd = String(period.end);

  const atStart = period.era === 'before' && period.index === 0;
  const atEnd = period.era === 'after' && period.index === inEra.length - 1;
  stepBack.disabled = atStart;
  stepForward.disabled = atEnd;

  eraPopout.querySelectorAll<HTMLButtonElement>('[data-era]').forEach((button) => {
    const current = button.dataset.era === period.era;
    button.setAttribute('aria-current', current ? 'true' : 'false');
  });

  refreshRuler();
  requestAnimationFrame(refreshRuler);

  const keepRoute = retainRoute && selected === null;
  retainRoute = false;
  const framePoles = !!options?.framePoles && selected === null && visible.some((event) => Math.abs(event.lat) >= 80);
  mapView.setEvents(visible);
  mapView.setSelected(selected, { keepRoute, framePoles });
}

function refreshRuler() {
  paintTicks(periodsForEra(period.era, present).length);
  paintEraLabels();
  placeThumb();
  requestAnimationFrame(separateEraLabels);
}

function spokenRange(label: string) {
  return label.replaceAll('–', ' to ').replace(/\s+/g, ' ').trim();
}

function paintTicks(count: number) {
  const width = ticks.clientWidth;
  if (width < 8) return;
  const maxFit = Math.max(2, Math.floor(width / 3));
  const shown = Math.min(count, maxFit);
  ticks.replaceChildren();
  ticks.dataset.count = String(count);
  ticks.dataset.shown = String(shown);
  for (let index = 0; index < shown; index += 1) {
    const tick = document.createElement('span');
    tick.className = index % 5 === 0 ? 'tick is-major' : 'tick';
    const ratio = shown === 1 ? 0 : index / (shown - 1);
    tick.style.left = `${ratio * 100}%`;
    ticks.append(tick);
  }
}

const ERA_MARKS: { year: number; text: string }[] = [
  { year: -300000, text: '300k' },
  { year: -100000, text: '100k' },
  { year: -3000, text: '3000 BCE' },
  { year: 0, text: '0' },
  { year: 2000, text: '2000' },
];
const HIDE_ERA_MARK_FIRST = ['100k', '0', '3000 BCE', '300k', '2000'];

function paintEraLabels() {
  const periods = periodsForEra(period.era, present);
  const start = periods[0].start;
  const end = periods[periods.length - 1].end;
  const span = end - start;
  eraLabels.replaceChildren();
  for (const mark of ERA_MARKS) {
    if (mark.year === 0 && period.era !== 'after') continue;
    if (mark.year !== 0 && mark.year !== -3000 && (mark.year < start || mark.year > end)) continue;
    const ratio = span <= 0 ? 0 : Math.min(1, Math.max(0, (mark.year - start) / span));
    const node = document.createElement('span');
    node.className = 'era-tick';
    node.dataset.mark = mark.text;
    node.textContent = mark.text;
    node.style.left = `${ratio * 100}%`;
    node.style.transform = ratio <= 0.02 ? 'translateX(0)' : ratio >= 0.98 ? 'translateX(-100%)' : 'translateX(-50%)';
    eraLabels.append(node);
  }
}

function separateEraLabels() {
  const labels = [...eraLabels.querySelectorAll<HTMLElement>('.era-tick')];
  labels.forEach((node) => {
    node.hidden = false;
  });
  const thumb = periodButton.getBoundingClientRect();
  const hits = (a: DOMRect, b: DOMRect) =>
    a.width > 1 && b.width > 1 && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
  for (let guard = 0; guard < labels.length; guard += 1) {
    const visible = labels.filter((node) => !node.hidden);
    let hide: HTMLElement | null = null;
    let hideRank = HIDE_ERA_MARK_FIRST.length;
    for (const node of visible) {
      const rect = node.getBoundingClientRect();
      const collides =
        hits(rect, thumb) ||
        visible.some((other) => other !== node && hits(rect, other.getBoundingClientRect()));
      if (!collides) continue;
      const rank = HIDE_ERA_MARK_FIRST.indexOf(node.dataset.mark ?? '');
      if (rank !== -1 && rank < hideRank) {
        hide = node;
        hideRank = rank;
      }
    }
    if (!hide) break;
    hide.hidden = true;
  }
}

function placeThumb() {
  const band = periodButton.parentElement;
  const card = band?.closest<HTMLElement>('.time');
  if (!band || !card) return;
  const max = Number(slider.max);
  const ratio = max <= 0 ? 0 : Number(slider.value) / max;
  const sliderRect = slider.getBoundingClientRect();
  const bandRect = band.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  if (bandRect.width < 8 || sliderRect.width < 2) return;
  const thumbWidth = 4;
  const center = sliderRect.left + thumbWidth / 2 + ratio * (sliderRect.width - thumbWidth);
  const half = periodButton.offsetWidth / 2;
  const min = Math.max(half + 2, cardRect.left - bandRect.left + half + 4);
  let maxX = cardRect.right - bandRect.left - half - 4;
  if (toolsButton.offsetParent) {
    const tools = toolsButton.getBoundingClientRect();
    if (tools.width > 2) maxX = Math.min(maxX, tools.left - bandRect.left - half - 4);
  }
  const x = Math.min(Math.max(center - bandRect.left, min), Math.max(min, maxX));
  periodButton.style.left = `${x}px`;
}

function startPlayback() {
  if (stepForward.disabled || playing) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyPeriod(shiftPeriod(period, 1, present));
    return;
  }
  playing = true;
  app!.dataset.playing = '1';
  playButton.setAttribute('aria-pressed', 'true');
  playButton.setAttribute('aria-label', 'Pause');
  playButton.dataset.tip = 'Pause';
  playButton.innerHTML = iconPause();
  playTimer = setInterval(() => {
    applyPeriod(shiftPeriod(period, 1, present));
    if (stepForward.disabled) stopPlayback();
  }, PLAY_MS);
}

function stopPlayback() {
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  if (!playing) return;
  playing = false;
  delete app!.dataset.playing;
  playButton.setAttribute('aria-pressed', 'false');
  playButton.setAttribute('aria-label', 'Play');
  playButton.dataset.tip = 'Play';
  playButton.innerHTML = iconPlay();
}

function toggleDate() {
  const open = eraPopout.hidden;
  closePopouts();
  if (!open) return;
  eraPopout.hidden = false;
  dateButton.setAttribute('aria-expanded', 'true');
  eraButton.setAttribute('aria-expanded', 'true');
  toolsButton.setAttribute('aria-expanded', 'true');
  periodButton.setAttribute('aria-expanded', 'true');
  dateInput.focus();
}

function togglePopout(panel: HTMLElement, button: HTMLElement) {
  const willOpen = panel.hidden;
  closePopouts();
  panel.hidden = !willOpen;
  button.setAttribute('aria-expanded', String(willOpen));
}

function closePopouts() {
  dateInput.classList.remove('is-invalid');
  eraPopout.hidden = true;
  keyPanel.hidden = true;
  eraButton.setAttribute('aria-expanded', 'false');
  toolsButton.setAttribute('aria-expanded', 'false');
  keyButton.setAttribute('aria-expanded', 'false');
  periodButton.setAttribute('aria-expanded', 'false');
  dateButton.setAttribute('aria-expanded', 'false');
}

function iconPlus() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
}
function iconMinus() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
}
function iconChevron(direction: 'left' | 'right') {
  const d = direction === 'left' ? 'M14 6l-6 6 6 6' : 'M10 6l6 6-6 6';
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function iconKey() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="14" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 12.5L19 4m0 0h-4m4 0v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function iconEra() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16c2.5-4 5-4 8 0s5.5 4 8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="8" r="2.2" fill="currentColor"/></svg>';
}
function iconPlay() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l12 7-12 7z" fill="currentColor"/></svg>';
}
function iconPause() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>';
}
function iconDate() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 3v4M16 3v4M4 10h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
}
function iconAxe() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c2.6 3.2 4.2 6.4 4.2 9.2a4.2 4.2 0 0 1-8.4 0c0-2.8 1.6-6 4.2-9.2z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.2 13.2h5.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
}
function iconTemple() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6.5 20V9.5M12 20V9.5M17.5 20V9.5M3.5 9.5h17M6 9.5V6.5h12V9.5M12 6.5V4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

render();

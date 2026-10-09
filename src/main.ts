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
    </div>
    <div class="time-row">
      <button type="button" id="step-back" class="icon-button" data-tip="Earlier" aria-label="Earlier">${iconChevron('left')}</button>
      <button type="button" id="play" class="icon-button" data-tip="Play" aria-label="Play" aria-pressed="false">${iconPlay()}</button>
      <div class="ruler">
        <div class="ticks" id="ticks" aria-hidden="true"></div>
        <input id="slider" type="range" min="0" step="1" aria-label="Time" />
      </div>
      <button type="button" id="step-forward" class="icon-button" data-tip="Later" aria-label="Later">${iconChevron('right')}</button>
      <button type="button" id="date-button" class="icon-button" data-tip="Date" aria-label="Date" aria-expanded="false">${iconDate()}</button>
      <button type="button" id="era-button" class="icon-button" data-tip="Switch era" aria-label="Switch era" aria-expanded="false">${iconEra()}</button>
    </div>
    <div id="era-popout" class="popout" hidden>
      <button type="button" class="era-option" data-era="before">Before civilisation</button>
      <button type="button" class="era-option" data-era="after">After civilisation</button>
    </div>
    <form id="date-popout" class="popout" hidden>
      <input id="date-input" name="date" aria-label="Date" autocomplete="off" enterkeyhint="go" />
    </form>
  </div>
`;

const mapEl = app.querySelector<HTMLElement>('#map')!;
const mapView = createMap(mapEl, app);
const periodButton = app.querySelector<HTMLButtonElement>('#period-button')!;
const slider = app.querySelector<HTMLInputElement>('#slider')!;
const ticks = app.querySelector<HTMLElement>('#ticks')!;
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

eraButton.addEventListener('click', () => {
  togglePopout(eraPopout, eraButton);
});

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

document.addEventListener('pointerdown', (event) => {
  const element = event.target instanceof Element ? event.target : null;
  if (!element?.closest('#play')) stopPlayback();
  if (!element) return;
  if (!datePopout.hidden && !element.closest('#date-popout, #date-button, #period-button')) {
    datePopout.hidden = true;
    dateInput.classList.remove('is-invalid');
    dateButton.setAttribute('aria-expanded', 'false');
    periodButton.setAttribute('aria-expanded', 'false');
  }
  if (!eraPopout.hidden && !element.closest('#era-popout, #era-button')) {
    eraPopout.hidden = true;
    eraButton.setAttribute('aria-expanded', 'false');
  }
  if (!keyPanel.hidden && !element.closest('#key-panel, #key-button')) {
    keyPanel.hidden = true;
    keyButton.setAttribute('aria-expanded', 'false');
  }
});

document.addEventListener('keydown', (event) => {
  const element = event.target instanceof Element ? event.target : null;
  if (!element?.closest('#play')) stopPlayback();
  if (event.key !== 'Escape') return;
  if (!datePopout.hidden || !eraPopout.hidden || !keyPanel.hidden) {
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
  placeThumb();
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

function placeThumb() {
  const band = periodButton.parentElement;
  if (!band) return;
  const max = Number(slider.max);
  const ratio = max <= 0 ? 0 : Number(slider.value) / max;
  const sliderRect = slider.getBoundingClientRect();
  const bandRect = band.getBoundingClientRect();
  if (bandRect.width < 8 || sliderRect.width < 2) return;
  const half = periodButton.offsetWidth / 2;
  let x = sliderRect.left - bandRect.left + ratio * sliderRect.width;
  x = Math.min(Math.max(x, half + 2), Math.max(half + 2, bandRect.width - half - 2));
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
  const open = datePopout.hidden;
  closePopouts();
  if (!open) return;
  datePopout.hidden = false;
  dateButton.setAttribute('aria-expanded', 'true');
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
  datePopout.hidden = true;
  dateInput.classList.remove('is-invalid');
  eraPopout.hidden = true;
  keyPanel.hidden = true;
  eraButton.setAttribute('aria-expanded', 'false');
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

render();

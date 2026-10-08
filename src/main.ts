import 'maplibre-gl/dist/maplibre-gl.css';
import { formatYearRange, parseDateInput } from './dates';
import { createMap } from './map-view';
import { eventOverlapsPeriod, periodByIndex, periodsForEra, presentYear, resolvePeriod, shiftPeriod } from './timeline';
import type { Era, HistoryEvent, Period } from './types';
import eventsJson from '../data/events.json';

const events = eventsJson as HistoryEvent[];
const present = presentYear();

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
      <p class="key-row"><span class="swatch history"></span>History</p>
      <p class="key-row"><span class="swatch myth"></span>Myth</p>
    </div>
  </div>
  <div class="time">
    <div class="time-top">
      <button type="button" id="era-button" class="icon-button" data-tip="Switch era" aria-label="Switch era" aria-expanded="false">${iconEra()}</button>
      <button type="button" id="period-button" aria-label="Date"></button>
      <div id="era-popout" class="popout" hidden>
        <button type="button" class="era-option" data-era="before">Before civilisation</button>
        <button type="button" class="era-option" data-era="after">After civilisation</button>
      </div>
      <form id="date-popout" class="popout" hidden>
        <input id="date-input" name="date" aria-label="Date" autocomplete="off" enterkeyhint="go" />
      </form>
    </div>
    <div class="time-row">
      <button type="button" id="step-back" class="icon-button" data-tip="Earlier" aria-label="Earlier">${iconChevron('left')}</button>
      <input id="slider" type="range" min="0" step="1" aria-label="Time" />
      <button type="button" id="step-forward" class="icon-button" data-tip="Later" aria-label="Later">${iconChevron('right')}</button>
    </div>
  </div>
`;

const mapEl = app.querySelector<HTMLElement>('#map')!;
const mapView = createMap(mapEl, app);
const periodButton = app.querySelector<HTMLButtonElement>('#period-button')!;
const slider = app.querySelector<HTMLInputElement>('#slider')!;
const stepBack = app.querySelector<HTMLButtonElement>('#step-back')!;
const stepForward = app.querySelector<HTMLButtonElement>('#step-forward')!;
const eraButton = app.querySelector<HTMLButtonElement>('#era-button')!;
const eraPopout = app.querySelector<HTMLElement>('#era-popout')!;
const datePopout = app.querySelector<HTMLFormElement>('#date-popout')!;
const dateInput = app.querySelector<HTMLInputElement>('#date-input')!;
const keyButton = app.querySelector<HTMLButtonElement>('#key-button')!;
const keyPanel = app.querySelector<HTMLElement>('#key-panel')!;

let period = resolvePeriod(present, present);
const memory: Partial<Record<Era, Period>> = { after: period };
let selected: HistoryEvent | null = null;
let retainRoute = false;

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

periodButton.addEventListener('click', () => {
  togglePopout(datePopout, periodButton);
  if (!datePopout.hidden) dateInput.focus();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!datePopout.hidden) {
    datePopout.hidden = true;
    dateInput.classList.remove('is-invalid');
    periodButton.setAttribute('aria-expanded', 'false');
    return;
  }
  if (!selected) return;
  selected = null;
  retainRoute = true;
  render();
});

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

function applyPeriod(next: Period) {
  period = next;
  memory[next.era] = next;
  selected = null;
  retainRoute = false;
  render();
}

function render() {
  const inEra = periodsForEra(period.era, present);
  const visible = events.filter((event) => eventOverlapsPeriod(event, period));
  if (selected && !visible.some((event) => event.id === selected?.id)) selected = null;

  periodButton.textContent = formatYearRange(period.start, period.end);
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

  const keepRoute = retainRoute && selected === null;
  retainRoute = false;
  mapView.setEvents(visible);
  mapView.setSelected(selected, { keepRoute });
}

function togglePopout(panel: HTMLElement, button: HTMLElement) {
  const willOpen = panel.hidden;
  closePopouts();
  panel.hidden = !willOpen;
  button.setAttribute('aria-expanded', String(willOpen));
}

function closePopouts() {
  datePopout.hidden = true;
  eraPopout.hidden = true;
  keyPanel.hidden = true;
  eraButton.setAttribute('aria-expanded', 'false');
  keyButton.setAttribute('aria-expanded', 'false');
  periodButton.setAttribute('aria-expanded', 'false');
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

render();

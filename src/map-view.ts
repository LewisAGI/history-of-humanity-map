import { GeoJSONSource, Map as MapLibreMap, Marker, Popup, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { formatEventDate } from './dates';
import { arrivalBearing, pathCoordinates, routeLines, unwrappedPath } from './geo';
import { placementsFor, type ScreenPosition } from './spread';
import { LABEL_MIN_ZOOM, visibleLabelIds, type LabelBox } from './labels';
import type { HistoryEvent } from './types';

// Vite does not emit MapLibre's worker unless the URL is set. Without it the
// production build 404s and neither land nor route lines draw.
setWorkerUrl(workerUrl);

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export interface MapView {
  zoomIn: () => void;
  zoomOut: () => void;
  getZoom: () => number;
  setEvents: (events: HistoryEvent[]) => void;
  setSelected: (event: HistoryEvent | null) => void;
  onSelect: (handler: (event: HistoryEvent | null) => void) => void;
  onMove: (handler: () => void) => void;
}

export function createMap(container: HTMLElement, root: HTMLElement): MapView {
  const map = new MapLibreMap({
    container,
    style: mapStyle(),
    center: [18, 12],
    zoom: container.clientWidth < 700 ? 0.85 : 1.45,
    minZoom: 0.6,
    maxZoom: 8,
    maxPitch: 0,
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false,
    attributionControl: { compact: true, customAttribution: 'NASA Blue Marble · Natural Earth' },
    maplibreLogo: false,
    fadeDuration: 0,
  });

  const ready = new Promise<void>((resolve) => {
    let started = false;
    const setup = () => {
      if (started) return;
      started = true;
      map.setProjection({ type: 'globe' });
      map.setSky({
        'sky-color': '#12171c',
        'horizon-color': '#9aafc2',
        'sky-horizon-blend': 0.55,
        'atmosphere-blend': 0.45,
      });
      addArrowImage(map);
      map.addSource('migration', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'migration-casing',
        type: 'line',
        source: 'migration',
        filter: ['==', ['get', 'role'], 'line'],
        paint: { 'line-color': '#1c1916', 'line-width': 5, 'line-opacity': 0.8 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'migration-line',
        type: 'line',
        source: 'migration',
        filter: ['==', ['get', 'role'], 'line'],
        paint: { 'line-color': '#f6f1e6', 'line-width': 2.2 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'migration-head',
        type: 'symbol',
        source: 'migration',
        filter: ['==', ['get', 'role'], 'head'],
        layout: {
          'icon-image': 'migration-arrow',
          'icon-size': 0.8,
          'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
      resolve();
    };
    map.on('style.load', setup);
    if (map.isStyleLoaded()) setup();
  });

  let selectHandler: (event: HistoryEvent | null) => void = () => {};
  let moveHandler: () => void = () => {};
  let markers: Pin[] = [];
  let popup: Popup | null = null;
  let suppressClose = false;
  let selectedId: string | null = null;

  map.on('click', () => selectHandler(null));
  map.on('zoom', () => {
    root.dataset.zoom = map.getZoom().toFixed(2);
    refreshLabels();
  });
  map.on('move', () => {
    refreshLabels();
    moveHandler();
  });
  map.on('render', () => refreshLabels());
  map.on('idle', () => refreshLabels());

  window.__historyMap = map;

  function setEvents(events: HistoryEvent[]) {
    const { kept, skipped } = placementsFor(events);
    skipped.forEach((event) => {
      console.warn(`Skipping pin ${event.id}: invalid coordinates ${event.lat}, ${event.lng}`);
    });
    const next: Pin[] = [];
    kept.forEach((event) => {
      try {
        next.push(createPin(event, event));
      } catch (error) {
        console.warn(`Skipping pin ${event.id}`, error);
      }
    });
    const previous = markers;
    markers = next;
    previous.forEach((pin) => pin.marker.remove());
    refreshLabels();
    root.dataset.ready = 'true';
  }

  function setSelected(event: HistoryEvent | null) {
    selectedId = event?.id ?? null;
    markers.forEach((pin) => pin.element.classList.toggle('is-selected', pin.event.id === selectedId));
    drawArrow(event);
    openPopup(event);
    const framed = event ? framePath(event) : false;
    if (framed) map.once('moveend', () => settlePopup());
    else requestAnimationFrame(() => settlePopup());
    refreshLabels();
  }

  function createPin(event: HistoryEvent, at: ScreenPosition): Pin {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'pin';
    element.dataset.id = event.id;
    element.dataset.type = event.type;
    element.dataset.lat = String(event.lat);
    element.dataset.lng = String(event.lng);
    element.setAttribute('aria-label', event.title);
    element.innerHTML = `<span class="dot"></span><span class="pin-label"></span>`;
    const label = element.querySelector('.pin-label') as HTMLElement;
    label.textContent = event.title;
    element.addEventListener('click', (click) => {
      click.stopPropagation();
      selectHandler(event);
    });
    const marker = new Marker({
      element,
      anchor: 'center',
      opacityWhenCovered: 0,
      offset: [at.offsetX, at.offsetY],
    });
    marker.setLngLat([at.lng, at.lat]);
    marker.addTo(map);
    return { event, element, label, marker, at };
  }

  function refreshLabels() {
    const enabled = map.getZoom() >= LABEL_MIN_ZOOM;
    if (!enabled) {
      markers.forEach((pin) => pin.label.classList.remove('is-on'));
      return;
    }
    const boxes: LabelBox[] = [];
    markers.forEach((pin) => {
      if (pin.element.classList.contains('maplibregl-marker-covered')) {
        pin.label.classList.remove('is-on');
        return;
      }
      if (pin.element.offsetParent === null && pin.element.getClientRects().length === 0) {
        pin.label.classList.remove('is-on');
        return;
      }
      pin.label.classList.add('is-on');
      const rect = pin.label.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        pin.label.classList.remove('is-on');
        return;
      }
      boxes.push({
        id: pin.event.id,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      });
    });
    const visible = visibleLabelIds(boxes);
    markers.forEach((pin) => pin.label.classList.toggle('is-on', visible.has(pin.event.id)));
  }

  function drawArrow(event: HistoryEvent | null) {
    const source = map.getSource('migration') as GeoJSONSource | undefined;
    if (!source) return;
    const lines = routeLines(event?.path);
    if (lines.length === 0) {
      source.setData(EMPTY);
      root.dataset.arrow = '';
      return;
    }
    const features: GeoJSON.Feature[] = [];
    lines.forEach((line) => {
      pathCoordinates(line).forEach((coordinates) => {
        features.push({
          type: 'Feature',
          properties: { role: 'line' },
          geometry: { type: 'LineString', coordinates },
        });
      });
      const last = line[line.length - 1];
      features.push({
        type: 'Feature',
        properties: { role: 'head', bearing: arrivalBearing(line) },
        geometry: { type: 'Point', coordinates: [last.lng, last.lat] },
      });
    });
    source.setData({ type: 'FeatureCollection', features });
    root.dataset.arrow = event!.id;
  }

  function openPopup(event: HistoryEvent | null) {
    root.dataset.popup = '';
    suppressClose = true;
    popup?.remove();
    popup = null;
    suppressClose = false;
    if (!event) return;
    const next = new Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: popupMaxWidth(),
      offset: 16,
      className: 'event-popup',
      focusAfterOpen: false,
    })
      .setLngLat(pinLngLat(event))
      .setHTML(popupHtml(event))
      .addTo(map);
    popup = next;
    next.on('close', () => {
      if (suppressClose) return;
      if (selectedId === event.id) selectHandler(null);
    });
  }

  function pinLngLat(event: HistoryEvent): [number, number] {
    const pin = markers.find((item) => item.event.id === event.id);
    return pin ? [pin.at.lng, pin.at.lat] : [event.lng, event.lat];
  }

  function settlePopup(attempt = 0) {
    const element = popup?.getElement();
    if (!element) {
      root.dataset.popup = '';
      return;
    }
    element.style.marginLeft = '0px';
    element.style.marginTop = '0px';
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      if (attempt < 6) requestAnimationFrame(() => settlePopup(attempt + 1));
      return;
    }
    const limits = popupLimits();
    let dx = 0;
    let dy = 0;
    if (rect.right > limits.right) dx = limits.right - rect.right;
    if (rect.left + dx < limits.left) dx = limits.left - rect.left;
    if (rect.bottom > limits.bottom) dy = limits.bottom - rect.bottom;
    if (rect.top + dy < limits.top) dy = limits.top - rect.top;
    ({ dx, dy } = clearOfKey(rect, dx, dy, limits));
    element.style.marginLeft = `${dx}px`;
    element.style.marginTop = `${dy}px`;
    const placed = element.getBoundingClientRect();
    const outside = !boxInside(placed, limits) || hitsControls(placed);
    if (outside && attempt < 8) {
      requestAnimationFrame(() => settlePopup(attempt + 1));
      return;
    }
    root.dataset.popup = outside ? '' : 'in';
  }

  function framePath(event: HistoryEvent): boolean {
    const lines = routeLines(event.path).flatMap((line) => unwrappedPath(line));
    if (lines.length < 2) return false;
    const lngs = lines.map((coord) => coord[0]);
    const lats = lines.map((coord) => coord[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const span = Math.max(maxLng - minLng, maxLat - minLat);
    if (span <= 2) return false;
    if (maxLng > 180 || minLng < -180) {
      const centerLng = ((((minLng + maxLng) / 2 + 540) % 360) + 360) % 360 - 180;
      const zoom = Math.max(1.75, Math.min(3.2, 5.4 - Math.log2(span)));
      map.easeTo({
        center: [centerLng, (minLat + maxLat) / 2],
        zoom,
        duration: 800,
        padding: { top: 48, bottom: 220, left: 56, right: 80 },
      });
      return true;
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      {
        padding: { top: 72, bottom: 150, left: 48, right: 72 },
        maxZoom: 3.2,
        duration: 800,
      },
    );
    return true;
  }

  return {
    zoomIn: () => map.zoomIn({ duration: 200 }),
    zoomOut: () => map.zoomOut({ duration: 200 }),
    getZoom: () => map.getZoom(),
    setEvents: (events) => {
      void ready.then(() => setEvents(events));
    },
    setSelected: (event) => {
      void ready.then(() => setSelected(event));
    },
    onSelect: (handler) => {
      selectHandler = handler;
    },
    onMove: (handler) => {
      moveHandler = handler;
    },
  };
}

interface Pin {
  event: HistoryEvent;
  element: HTMLButtonElement;
  label: HTMLElement;
  marker: Marker;
  at: ScreenPosition;
}

interface BoxLimits {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function popupMaxWidth(): string {
  const margin = 8;
  const zoom = visibleRect(document.querySelector('.zoom'));
  const right = zoom ? zoom.left - margin : window.innerWidth - margin;
  const width = Math.min(320, Math.max(160, right - margin));
  return `${Math.floor(width)}px`;
}

function popupLimits(): BoxLimits {
  const margin = 8;
  const zoom = visibleRect(document.querySelector('.zoom'));
  const time = visibleRect(document.querySelector('.time'));
  return {
    left: margin,
    top: margin,
    right: Math.min(window.innerWidth - margin, zoom ? zoom.left - margin : window.innerWidth - margin),
    bottom: Math.min(window.innerHeight - margin, time ? time.top - margin : window.innerHeight - margin),
  };
}

function clearOfKey(rect: DOMRect, dx: number, dy: number, limits: BoxLimits): { dx: number; dy: number } {
  const key = visibleRect(document.querySelector('.key-wrap'));
  if (!key) return { dx, dy };
  const gap = 8;
  const box = shifted(rect, dx, dy);
  const hit =
    box.left < key.right + gap && box.right > key.left - gap && box.top < key.bottom + gap && box.bottom > key.top - gap;
  if (!hit) return { dx, dy };
  const up = key.top - gap - box.bottom;
  if (box.top + up >= limits.top) dy += up;
  else dx += key.right + gap - box.left;
  if (rect.right + dx > limits.right) dx = limits.right - rect.right;
  if (rect.left + dx < limits.left) dx = limits.left - rect.left;
  if (rect.top + dy < limits.top) dy = limits.top - rect.top;
  if (rect.bottom + dy > limits.bottom) dy = limits.bottom - rect.bottom;
  return { dx, dy };
}

function shifted(rect: DOMRect, dx: number, dy: number) {
  return { left: rect.left + dx, right: rect.right + dx, top: rect.top + dy, bottom: rect.bottom + dy };
}

function boxInside(rect: DOMRect, limits: BoxLimits): boolean {
  return (
    rect.left >= limits.left - 1 &&
    rect.right <= limits.right + 1 &&
    rect.top >= limits.top - 1 &&
    rect.bottom <= limits.bottom + 1
  );
}

function hitsControls(rect: DOMRect): boolean {
  return ['.zoom', '.key-wrap', '.time'].some((selector) => {
    const control = visibleRect(document.querySelector(selector));
    if (!control) return false;
    return rect.left < control.right && rect.right > control.left && rect.top < control.bottom && rect.bottom > control.top;
  });
}

function visibleRect(element: Element | null): DOMRect | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  return rect;
}

function popupHtml(event: HistoryEvent): string {
  return `
    <h2 class="popup-title">${escapeHtml(event.title)}</h2>
    <p class="popup-date">${escapeHtml(formatEventDate(event.start, event.end, event.dateNote))}</p>
    <p class="popup-place">${escapeHtml(event.place)}</p>
    <p class="popup-summary">${escapeHtml(event.summary)}</p>
    <p class="popup-note">${escapeHtml(event.dateNote)}</p>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function addArrowImage(map: MapLibreMap) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, 32, 32);
  context.beginPath();
  context.moveTo(16, 3);
  context.lineTo(28, 28);
  context.lineTo(16, 21);
  context.lineTo(4, 28);
  context.closePath();
  context.fillStyle = '#f6f1e6';
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = '#1c1916';
  context.stroke();
  const image = context.getImageData(0, 0, 32, 32);
  if (!map.hasImage('migration-arrow')) map.addImage('migration-arrow', image);
}

function mapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      land: { type: 'geojson', data: '/ne_110m_land.geojson' },
      marble: {
        type: 'raster',
        tiles: [
          'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
        ],
        tileSize: 256,
        maxzoom: 8,
        attribution: 'NASA Blue Marble',
      },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': '#1c3d52' } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#c6b79a' } },
      {
        id: 'coast',
        type: 'line',
        source: 'land',
        paint: { 'line-color': '#6d624e', 'line-width': 0.6 },
      },
      {
        id: 'marble',
        type: 'raster',
        source: 'marble',
        paint: {
          'raster-saturation': -0.38,
          'raster-contrast': -0.06,
          'raster-brightness-min': 0.05,
          'raster-brightness-max': 0.96,
        },
      },
    ],
  };
}

declare global {
  interface Window {
    __historyMap: MapLibreMap;
  }
}

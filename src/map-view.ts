import { GeoJSONSource, Map as MapLibreMap, Marker, Popup, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { formatEventDate } from './dates';
import { arrivalBearing, pathCoordinates, routeLines, unwrappedPath } from './geo';
import { placementsFor, spreadOverlaps, type ScreenPosition } from './spread';
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
  setSelected: (event: HistoryEvent | null, options?: { keepRoute?: boolean }) => void;
  onSelect: (handler: (event: HistoryEvent | null) => void) => void;
  onPopupClose: (handler: () => void) => void;
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
  let popupCloseHandler: () => void = () => {};
  let moveHandler: () => void = () => {};
  let markers: Pin[] = [];
  let popup: Popup | null = null;
  let suppressClose = false;
  let ignoreMapClick = false;
  let selectedId: string | null = null;
  let anchorObserver: MutationObserver | null = null;
  let pinClearAttempts = 0;
  let userCamera = false;
  let popupAnchor: 'top' | 'bottom' = 'bottom';
  const sheet = document.createElement('div');
  sheet.className = 'event-sheet';
  sheet.hidden = true;
  root.appendChild(sheet);

  map.on('click', (event) => {
    if (ignoreMapClick) return;
    const target = event.originalEvent?.target;
    if (target instanceof Element && target.closest('.maplibregl-popup, .event-sheet')) return;
    selectHandler(null);
  });
  map.on('zoom', () => {
    root.dataset.zoom = map.getZoom().toFixed(2);
    refreshLabels();
    layoutPinOffsets();
  });
  map.on('move', () => {
    refreshLabels();
    moveHandler();
    layoutPinOffsets();
  });
  map.on('render', () => refreshLabels());
  map.on('movestart', (event) => {
    if (event.originalEvent) userCamera = true;
  });
  map.on('moveend', () => {
    if (!popup) {
      userCamera = false;
      return;
    }
    const event = markers.find((pin) => pin.event.id === selectedId)?.event;
    const point = map.project(popup.getLngLat());
    const width = map.getContainer().clientWidth;
    const height = map.getContainer().clientHeight;
    const onScreen = point.x >= 0 && point.y >= 0 && point.x <= width && point.y <= height;
    if (!onScreen) {
      if (userCamera) requestPopupClose();
      userCamera = false;
      return;
    }
    userCamera = false;
    const anchor = point.y > height / 2 ? 'bottom' : 'top';
    if (event && anchor !== popupAnchor) mountDesktopPopup(event, anchor);
    settlePopup();
  });
  map.on('idle', () => {
    refreshLabels();
    layoutPinOffsets();
    if (popup) settlePopup();
    else if (!sheet.hidden) {
      placeSheet();
      markSheet();
    }
    keepSelectedPinClear();
  });
  window.addEventListener('resize', () => {
    if (!sheet.hidden) placeSheet();
  });

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
    layoutPinOffsets();
    root.dataset.ready = 'true';
  }

  function setSelected(event: HistoryEvent | null, options?: { keepRoute?: boolean }) {
    selectedId = event?.id ?? null;
    userCamera = false;
    pinClearAttempts = 0;
    markers.forEach((pin) => pin.element.classList.toggle('is-selected', pin.event.id === selectedId));
    if (event) drawArrow(event);
    else if (!options?.keepRoute) drawArrow(null);
    openPopup(event);
    const framed = event ? frameSelection(event) : false;
    if (framed) map.once('moveend', () => finishPopup());
    else requestAnimationFrame(() => finishPopup());
    refreshLabels();
  }

  function finishPopup() {
    if (useSheet()) {
      placeSheet();
      markSheet();
    } else settlePopup();
    keepSelectedPinClear();
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
    // Scott and Amundsen share the pole. Shift the labels apart so both can show.
    if (event.id === 'scott-pole') label.style.transform = 'translateX(calc(-50% - 78px))';
    if (event.id === 'amundsen-pole') label.style.transform = 'translateX(calc(-50% + 78px))';
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
    const zoom = map.getZoom();
    const boxes: LabelBox[] = [];
    markers.forEach((pin) => {
      const minZoom = Math.abs(pin.at.lat) >= 80 ? 1.4 : LABEL_MIN_ZOOM;
      if (zoom < minZoom) {
        pin.label.classList.remove('is-on');
        return;
      }
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
    anchorObserver?.disconnect();
    anchorObserver = null;
    suppressClose = true;
    popup?.remove();
    popup = null;
    suppressClose = false;
    sheet.hidden = true;
    sheet.innerHTML = '';
    restoreKey();
    restoreAttribution();
    if (!event) return;
    if (useSheet()) {
      showSheet(event);
      return;
    }
    const point = map.project(pinLngLat(event));
    const anchor = point.y > map.getContainer().clientHeight / 2 ? 'bottom' : 'top';
    mountDesktopPopup(event, anchor);
  }

  function mountDesktopPopup(event: HistoryEvent, anchor: 'top' | 'bottom') {
    anchorObserver?.disconnect();
    anchorObserver = null;
    suppressClose = true;
    popup?.remove();
    popup = null;
    suppressClose = false;
    popupAnchor = anchor;
    const next = new Popup({
      anchor,
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
    const element = next.getElement();
    element?.addEventListener('mousedown', (mouseEvent) => {
      const target = mouseEvent.target;
      if (target instanceof Element && target.closest('.maplibregl-popup-close-button')) ignoreMapClick = true;
    });
    if (element) {
      anchorObserver = new MutationObserver(() => settlePopup());
      anchorObserver.observe(element, { attributes: true, attributeFilter: ['class'] });
    }
    next.on('close', () => {
      if (suppressClose) return;
      if (selectedId === event.id) requestPopupClose();
    });
  }

  function showSheet(event: HistoryEvent) {
    sheet.hidden = false;
    sheet.innerHTML = `<button type="button" class="sheet-close" aria-label="Close">×</button><div class="sheet-body">${popupHtml(event)}</div>`;
    sheet.querySelector<HTMLButtonElement>('.sheet-close')?.addEventListener('mousedown', () => {
      ignoreMapClick = true;
    });
    sheet.querySelector<HTMLButtonElement>('.sheet-close')?.addEventListener('click', (click) => {
      click.stopPropagation();
      if (selectedId === event.id) requestPopupClose();
    });
    placeSheet();
  }

  function requestPopupClose() {
    ignoreMapClick = true;
    window.setTimeout(() => {
      ignoreMapClick = false;
    }, 350);
    popupCloseHandler();
  }

  function placeSheet() {
    const margin = 12;
    const gap = 8;
    const landscape = window.innerWidth > window.innerHeight && window.innerHeight <= 500;
    if (landscape) {
      parkKey();
      parkAttribution();
    } else {
      restoreKey();
      restoreAttribution();
    }
    const wordmark = visibleRect(document.querySelector('.wordmark'));
    const time = visibleRect(document.querySelector('.time'));
    const zoom = visibleRect(document.querySelector('.zoom'));
    const key = visibleRect(document.querySelector('.key-wrap'));
    const attrib = visibleRect(document.querySelector('.maplibregl-ctrl-attrib'));
    const floors = (landscape ? [time?.top] : [time?.top, key?.top, attrib?.top]).filter(
      (value): value is number => value != null,
    );
    const controlTop = floors.length > 0 ? Math.min(...floors) : window.innerHeight - 128;
    const top = Math.round((wordmark ? wordmark.bottom : 40) + gap);
    const bottomEdge = Math.round(controlTop - gap);
    const zoomBottom = (zoom ? zoom.bottom : 56) + gap;
    const band = bottomEdge - zoomBottom;
    if (landscape || band < 160) {
      const width = landscape
        ? Math.min(360, Math.floor(window.innerWidth * 0.42))
        : Math.max(180, Math.floor((zoom ? zoom.left : window.innerWidth - 56) - gap - margin));
      const height = Math.max(1, bottomEdge - top);
      sheet.style.left = `${margin}px`;
      sheet.style.right = 'auto';
      sheet.style.top = `${top}px`;
      sheet.style.bottom = 'auto';
      sheet.style.width = `${width}px`;
      sheet.style.maxWidth = 'none';
      sheet.style.height = `${height}px`;
      sheet.style.maxHeight = `${height}px`;
      return;
    }
    const bottom = Math.max(margin, window.innerHeight - controlTop + gap);
    const available = window.innerHeight - bottom - zoomBottom;
    const maxHeight = Math.min(window.innerHeight * 0.42, available);
    sheet.style.left = `${margin}px`;
    sheet.style.right = `${margin}px`;
    sheet.style.top = 'auto';
    sheet.style.bottom = `${bottom}px`;
    sheet.style.width = 'auto';
    sheet.style.height = 'auto';
    sheet.style.maxWidth = 'none';
    sheet.style.maxHeight = `${Math.floor(maxHeight)}px`;
  }

  function parkKey() {
    const keyEl = document.querySelector<HTMLElement>('.key-wrap');
    const wordmark = visibleRect(document.querySelector('.wordmark'));
    if (!keyEl) return;
    const top = Math.round((wordmark ? wordmark.bottom : 40) + 8);
    keyEl.classList.add('is-parked');
    keyEl.style.left = 'auto';
    keyEl.style.right = '12px';
    keyEl.style.bottom = 'auto';
    keyEl.style.top = `${top}px`;
  }

  function restoreKey() {
    const keyEl = document.querySelector<HTMLElement>('.key-wrap');
    if (!keyEl) return;
    keyEl.classList.remove('is-parked');
    keyEl.style.left = '';
    keyEl.style.right = '';
    keyEl.style.top = '';
    keyEl.style.bottom = '';
  }

  /**
   * A full attribution chip covers either a southern or a northern arrowhead
   * on a short landscape globe. Collapse it to the info button and park that
   * button above the key, in the band framing already keeps clear.
   */
  function parkAttribution() {
    const wrap = document.querySelector<HTMLElement>('.maplibregl-ctrl-bottom-right');
    const attrib = wrap?.querySelector<HTMLElement>('.maplibregl-ctrl-attrib');
    if (!wrap || !attrib || attrib.dataset.parked === '1') return;
    attrib.dataset.wasCompact = attrib.classList.contains('maplibregl-compact') ? '1' : '0';
    attrib.dataset.parked = '1';
    attrib.classList.add('maplibregl-compact');
    attrib.classList.remove('maplibregl-compact-show');
    if (attrib instanceof HTMLDetailsElement) attrib.open = false;
    attrib.style.margin = '0';
    wrap.classList.add('is-parked');
    wrap.style.top = '12px';
    wrap.style.bottom = 'auto';
    wrap.style.right = '12px';
    wrap.style.left = 'auto';
  }

  function restoreAttribution() {
    const wrap = document.querySelector<HTMLElement>('.maplibregl-ctrl-bottom-right');
    const attrib = wrap?.querySelector<HTMLElement>('.maplibregl-ctrl-attrib');
    if (!wrap || !attrib || attrib.dataset.parked !== '1') return;
    wrap.classList.remove('is-parked');
    wrap.style.top = '';
    wrap.style.bottom = '';
    wrap.style.right = '';
    wrap.style.left = '';
    attrib.style.margin = '';
    attrib.classList.remove('maplibregl-compact-show');
    if (attrib.dataset.wasCompact === '1') attrib.classList.add('maplibregl-compact');
    else attrib.classList.remove('maplibregl-compact');
    delete attrib.dataset.parked;
    delete attrib.dataset.wasCompact;
  }

  function markSheet() {
    if (sheet.hidden) {
      root.dataset.popup = '';
      return;
    }
    const rect = sheet.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      root.dataset.popup = '';
      return;
    }
    const inside =
      rect.left >= -1 &&
      rect.top >= -1 &&
      rect.right <= window.innerWidth + 1 &&
      rect.bottom <= window.innerHeight + 1;
    root.dataset.popup = inside && !hitsControls(rect) ? 'in' : '';
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

  function frameSelection(event: HistoryEvent): boolean {
    if (routeLines(event.path).length === 0) return framePolar(event);
    return framePath(event);
  }

  function framePolar(event: HistoryEvent): boolean {
    if (Math.abs(event.lat) < 80) return false;
    clearFramePadding();
    map.easeTo({
      center: [event.lng, clampCenterLat(event.lat)],
      zoom: Math.min(map.getZoom(), 1.8),
      padding: framePadding(),
      duration: 700,
    });
    return true;
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
    if (span <= 2) return framePolar(event);
    clearFramePadding();
    const padding = framePadding();
    const midLat = (minLat + maxLat) / 2;
    if (useSheet() && Math.abs(midLat) > 60 && maxLng <= 180 && minLng >= -180) {
      const shrunk = (maxLng - minLng) * Math.cos((Math.abs(midLat) * Math.PI) / 180);
      // A short landscape globe hides a polar arrowhead above about zoom 1.6.
      const highLatCap = window.innerHeight <= 500 ? 1.5 : 2.2;
      map.easeTo({
        center: [wrapLng((minLng + maxLng) / 2), Math.max(-70, Math.min(70, midLat))],
        zoom: zoomForSpan(Math.max(shrunk, 6), Math.max(maxLat - minLat, 4), padding, highLatCap),
        padding,
        duration: 800,
      });
      return true;
    }
    if (maxLng > 180 || minLng < -180) {
      const centerLng = ((((minLng + maxLng) / 2 + 540) % 360) + 360) % 360 - 180;
      const centerLat = Math.max(-70, Math.min(70, (minLat + maxLat) / 2));
      map.easeTo({
        center: [centerLng, centerLat],
        zoom: zoomForSpan(maxLng - minLng, maxLat - minLat, padding, useSheet() ? 1.35 : 3.2),
        duration: 800,
        padding,
      });
      return true;
    }
    const sheetBox = sheet.hidden ? null : visibleRect(sheet);
    if (sheetBox && sheetBox.right < window.innerWidth - 80) {
      map.easeTo({
        center: [(minLng + maxLng) / 2, Math.max(-70, Math.min(70, midLat))],
        zoom: zoomForSpan(maxLng - minLng, maxLat - minLat, padding, 2.4),
        padding,
        duration: 800,
      });
      return true;
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding, maxZoom: useSheet() ? 2.4 : 3.2, duration: 800 },
    );
    return true;
  }

  function clearFramePadding() {
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  }

  function framePadding(): { top: number; bottom: number; left: number; right: number } {
    const zoom = visibleRect(document.querySelector('.zoom'));
    const time = visibleRect(document.querySelector('.time'));
    const wordmark = visibleRect(document.querySelector('.wordmark'));
    const sheetBox = sheet.hidden ? null : visibleRect(sheet);
    const top = Math.max(56, (wordmark ? wordmark.bottom : 40) + 16);
    if (useSheet() && sheetBox) {
      const side = sheetBox.right < window.innerWidth - 80;
      if (side) {
        return {
          top,
          left: sheetBox.right + 16,
          right: (zoom?.width ?? 44) + 24,
          bottom: time ? Math.max(16, window.innerHeight - time.top + 16) : 120,
        };
      }
      return {
        top,
        left: 24,
        right: (zoom?.width ?? 44) + 24,
        bottom: Math.max(16, window.innerHeight - sheetBox.top + 16),
      };
    }
    const bottom = time ? Math.max(150, window.innerHeight - time.top + 24) : 150;
    return { top: 72, bottom, left: 48, right: 72 };
  }

  function zoomForSpan(
    lngSpan: number,
    latSpan: number,
    padding: { top: number; bottom: number; left: number; right: number },
    cap = 3.2,
  ): number {
    const width = Math.max(64, map.getContainer().clientWidth - padding.left - padding.right);
    const height = Math.max(64, map.getContainer().clientHeight - padding.top - padding.bottom);
    const world = 512;
    const zoomLng = Math.log2((width * 360) / (Math.max(lngSpan, 1) * world));
    const zoomLat = Math.log2((height * 160) / (Math.max(latSpan, 1) * world));
    let zoom = Math.min(cap, zoomLng, zoomLat);
    if (!useSheet()) zoom = Math.max(1.75, zoom);
    return Math.max(map.getMinZoom(), zoom);
  }

  function layoutPinOffsets() {
    const visible = markers.filter((pin) => !pin.element.classList.contains('maplibregl-marker-covered'));
    const points = visible.flatMap((pin) => {
      const rect = pin.element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return [];
      const current = pin.marker.getOffset();
      return [
        {
          id: pin.event.id,
          x: rect.left + rect.width / 2 - current.x + pin.at.offsetX,
          y: rect.top + rect.height / 2 - current.y + pin.at.offsetY,
        },
      ];
    });
    const extra = spreadOverlaps(points);
    markers.forEach((pin) => {
      const add = extra.get(pin.event.id) ?? { x: 0, y: 0 };
      const nextX = pin.at.offsetX + add.x;
      const nextY = pin.at.offsetY + add.y;
      const current = pin.marker.getOffset();
      if (Math.abs(current.x - nextX) < 0.5 && Math.abs(current.y - nextY) < 0.5) return;
      pin.marker.setOffset([nextX, nextY]);
    });
  }

  function keepSelectedPinClear() {
    if (!selectedId) return;
    const pin = markers.find((item) => item.event.id === selectedId);
    if (!pin || routeLines(pin.event.path).length > 0) return;
    const rect = pin.element.getBoundingClientRect();
    if (rect.width < 2) return;
    const limit = obstacleTop();
    const onScreen = rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth;
    if (onScreen && rect.bottom <= limit - 8) {
      pinClearAttempts = 0;
      return;
    }
    if (pinClearAttempts >= 4) return;
    pinClearAttempts += 1;
    const dy = Math.max(12, rect.bottom - (limit - 16));
    const center = map.project(map.getCenter());
    const next = map.unproject([center.x, center.y + dy]);
    const before = map.getCenter();
    const stuck = Math.abs(next.lat - before.lat) < 0.08 && Math.abs(next.lng - before.lng) < 0.08;
    if (stuck) {
      if (map.getZoom() > 1.25) {
        clearFramePadding();
        map.easeTo({
          center: [pin.at.lng, clampCenterLat(pin.at.lat)],
          zoom: Math.max(1.15, map.getZoom() - 0.55),
          padding: framePadding(),
          duration: 400,
        });
      }
      return;
    }
    map.easeTo({ center: [next.lng, next.lat], duration: 400 });
  }

  function obstacleTop(): number {
    const time = visibleRect(document.querySelector('.time'));
    const sheetBox = sheet.hidden ? null : visibleRect(sheet);
    return Math.min(time?.top ?? window.innerHeight, sheetBox?.top ?? window.innerHeight);
  }

  return {
    zoomIn: () => {
      userCamera = true;
      map.zoomIn({ duration: 200 });
    },
    zoomOut: () => {
      userCamera = true;
      map.zoomOut({ duration: 200 });
    },
    getZoom: () => map.getZoom(),
    setEvents: (events) => {
      void ready.then(() => setEvents(events));
    },
    setSelected: (event, options) => {
      void ready.then(() => setSelected(event, options));
    },
    onSelect: (handler) => {
      selectHandler = handler;
    },
    onPopupClose: (handler) => {
      popupCloseHandler = handler;
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

function useSheet(): boolean {
  return window.innerWidth <= 600 || window.innerHeight <= 500;
}

function clampCenterLat(lat: number): number {
  return Math.max(-85, Math.min(85, lat));
}

function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
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
  const wordmark = visibleRect(document.querySelector('.wordmark'));
  return {
    left: margin,
    top: Math.max(margin, wordmark ? wordmark.bottom + margin : margin),
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
  return ['.zoom', '.key-wrap', '.time', '.wordmark'].some((selector) => {
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

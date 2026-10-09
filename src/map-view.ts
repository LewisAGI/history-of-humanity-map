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
  let routeGeometry: GeoJSON.Feature[] = [];
  let anchorObserver: MutationObserver | null = null;
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
  });
  window.addEventListener('resize', () => {
    const event = markers.find((pin) => pin.event.id === selectedId)?.event ?? null;
    if (!event) {
      restoreKey();
      restoreAttribution();
      restoreZoom();
      return;
    }
    openPopup(event);
    frameSelection(event);
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
    markers.forEach((pin) => pin.element.classList.toggle('is-selected', pin.event.id === selectedId));
    if (event) drawArrow(event);
    else if (!options?.keepRoute) drawArrow(null);
    openPopup(event);
    if (!event) clearFramePadding();
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
      routeGeometry = [];
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
    routeGeometry = features;
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
    restoreZoom();
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
    const side = window.innerWidth > window.innerHeight;
    if (side) {
      parkKey();
      parkAttribution();
      restoreZoom();
    } else {
      restoreKey();
      restoreAttribution();
      restoreZoom();
    }
    const wordmark = visibleRect(document.querySelector('.wordmark'));
    const time = visibleRect(document.querySelector('.time'));
    const key = visibleRect(document.querySelector('.key-wrap'));
    const attrib = visibleRect(document.querySelector('.maplibregl-ctrl-attrib'));
    const top = Math.round((wordmark ? wordmark.bottom : 40) + gap);
    if (side) {
      const floors = [time?.top].filter((value): value is number => value != null);
      const controlTop = floors.length > 0 ? Math.min(...floors) : window.innerHeight - 128;
      const bottomEdge = Math.round(controlTop - gap);
      const width = Math.min(360, Math.floor(window.innerWidth * 0.42));
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
    const floors = [time?.top, key?.top, attrib?.top].filter((value): value is number => value != null);
    const controlTop = floors.length > 0 ? Math.min(...floors) : window.innerHeight - 128;
    const bottom = Math.max(margin, window.innerHeight - controlTop + gap);
    const available = window.innerHeight - bottom - top;
    const maxHeight = Math.min(window.innerHeight * 0.4, Math.max(1, available));
    sheet.style.left = `${margin}px`;
    sheet.style.right = `${margin}px`;
    sheet.style.top = 'auto';
    sheet.style.bottom = `${bottom}px`;
    sheet.style.width = 'auto';
    sheet.style.height = 'auto';
    sheet.style.maxWidth = 'none';
    sheet.style.maxHeight = `${Math.floor(maxHeight)}px`;
    raiseZoomAboveSheet();
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

  function restoreZoom() {
    const zoomEl = document.querySelector<HTMLElement>('.zoom');
    if (!zoomEl) return;
    zoomEl.classList.remove('is-raised', 'is-hidden');
    zoomEl.style.top = '';
    zoomEl.style.bottom = '';
    zoomEl.style.transform = '';
  }

  /** A bottom sheet on a short portrait phone runs through the zoom column. Lift it clear. */
  function raiseZoomAboveSheet() {
    const zoomEl = document.querySelector<HTMLElement>('.zoom');
    const sheetBox = visibleRect(sheet);
    if (!zoomEl || !sheetBox) return;
    const zoom = zoomEl.getBoundingClientRect();
    const overlaps = zoom.top < sheetBox.bottom - 4 && zoom.bottom > sheetBox.top + 4;
    if (!overlaps || zoom.height < 2) return;
    const wordmark = visibleRect(document.querySelector('.wordmark'));
    const topLimit = (wordmark ? wordmark.bottom : 40) + 8;
    const nextTop = sheetBox.top - 8 - zoom.height;
    if (nextTop < topLimit) {
      zoomEl.classList.add('is-hidden');
      zoomEl.classList.remove('is-raised');
      zoomEl.style.transform = 'none';
      zoomEl.style.top = '-200px';
      zoomEl.style.bottom = 'auto';
      return;
    }
    zoomEl.classList.remove('is-hidden');
    zoomEl.classList.add('is-raised');
    zoomEl.style.transform = 'none';
    zoomEl.style.top = `${Math.round(nextTop)}px`;
    zoomEl.style.bottom = 'auto';
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
    ({ dx, dy } = clearOfSelection(rect, dx, dy, limits));
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
    if (routeLines(event.path).length === 0) return framePoint(event);
    return framePath(event);
  }

  /**
   * One ease onto the visible face. No follow-up pans. Zoom never drops below minZoom.
   * A pole is the camera target: the globe can sit on ±90 at minZoom, so the pin
   * lands on the padding centre instead of a hundred pixels toward the sheet.
   */
  function framePoint(event: HistoryEvent): boolean {
    const padding = framePadding();
    const minZoom = map.getMinZoom();
    const polar = Math.abs(event.lat) >= 80;
    map.easeTo({
      center: [wrapLng(event.lng), polar ? event.lat : clampCenterLat(event.lat)],
      zoom: polar ? minZoom : Math.max(minZoom, map.getZoom()),
      padding,
      duration: 500,
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
    if (span <= 2) return framePoint(event);
    const padding = framePadding();
    const midLat = (minLat + maxLat) / 2;
    if (useSheet() && Math.abs(midLat) > 60 && maxLng <= 180 && minLng >= -180) {
      const shrunk = (maxLng - minLng) * Math.cos((Math.abs(midLat) * Math.PI) / 180);
      // Sit the camera on the poleward end so its arrowhead is the padding centre.
      // A midpoint at this latitude leaves that head above the screen.
      const centerLat = Math.max(-82, Math.min(82, midLat > 0 ? maxLat : minLat));
      const polar = Math.log2(Math.max(0.2, Math.cos((Math.abs(centerLat) * Math.PI) / 180)));
      const fitted = zoomForSpan(Math.max(shrunk, 6), Math.max(maxLat - minLat, 4), padding, 2.2);
      map.easeTo({
        center: [wrapLng((minLng + maxLng) / 2), centerLat],
        zoom: Math.max(map.getMinZoom(), Math.min(1.35, fitted + polar)),
        padding,
        duration: 800,
      });
      return true;
    }
    if (maxLng > 180 || minLng < -180) {
      const centerLng = ((((minLng + maxLng) / 2 + 540) % 360) + 360) % 360 - 180;
      const centerLat = Math.max(-70, Math.min(70, (minLat + maxLat) / 2));
      // A southern arrowhead needs the extra bottom inset. Other crossings,
      // such as Cook, lose their northern half off the top of a short phone if
      // the vanishing point sits that high.
      const heads = routeLines(event.path).map((line) => line[line.length - 1].lat);
      const southernHead = heads.some((lat) => lat <= minLat + 8);
      const fitted = framePadding(southernHead ? 80 : 16);
      map.easeTo({
        center: [centerLng, centerLat],
        zoom: zoomForSpan(maxLng - minLng, maxLat - minLat, fitted, useSheet() ? 1.35 : 3.2),
        duration: 800,
        padding: fitted,
      });
      return true;
    }
    const sheetBox = sheet.hidden ? null : visibleRect(sheet);
    if (sheetBox) {
      map.easeTo({
        center: [wrapLng((minLng + maxLng) / 2), Math.max(-70, Math.min(70, midLat))],
        zoom: zoomForSpan(maxLng - minLng, maxLat - minLat, padding, 2.2),
        padding,
        duration: 600,
      });
      return true;
    }
    // easeTo keeps the padding on this one move. fitBounds bakes padding into
    // the centre and then drops it, so a later route inherits a stale inset.
    map.easeTo({
      center: [wrapLng((minLng + maxLng) / 2), Math.max(-70, Math.min(70, midLat))],
      zoom: zoomForSpan(maxLng - minLng, maxLat - minLat, padding, useSheet() ? 2.4 : 3.2),
      padding,
      duration: 800,
    });
    return true;
  }

  /**
   * Keep the desktop card off the selected pin, the arrowheads, and the route.
   * A corner is used only when the anchored card covers the line. No camera move.
   */
  function clearOfSelection(
    rect: DOMRect,
    dx: number,
    dy: number,
    limits: BoxLimits,
  ): { dx: number; dy: number } {
    const pin = document.querySelector('.pin.is-selected')?.getBoundingClientRect();
    const samples: { x: number; y: number }[] = [];
    const heads: { x: number; y: number }[] = [];
    routeGeometry.forEach((feature) => {
      const geometry = feature.geometry;
      if (geometry.type === 'Point') {
        const [lng, lat] = geometry.coordinates;
        const point = map.project([lng, lat]);
        heads.push({ x: point.x, y: point.y });
        return;
      }
      if (geometry.type !== 'LineString') return;
      const coordinates = geometry.coordinates;
      for (let index = 1; index < coordinates.length; index += 1) {
        const start = coordinates[index - 1];
        const end = coordinates[index];
        const steps = Math.max(1, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / 4));
        for (let step = 0; step <= steps; step += 1) {
          const t = step / steps;
          const point = map.project([
            start[0] + (end[0] - start[0]) * t,
            start[1] + (end[1] - start[1]) * t,
          ]);
          samples.push({ x: point.x, y: point.y });
        }
      }
    });
    const attrib = visibleRect(document.querySelector('.maplibregl-ctrl-attrib'));
    const blocked = (box: { left: number; right: number; top: number; bottom: number }) => {
      const pinHit =
        !!pin &&
        pin.width > 2 &&
        box.left < pin.right + 6 &&
        box.right > pin.left - 6 &&
        box.top < pin.bottom + 6 &&
        box.bottom > pin.top - 6;
      if (pinHit) return true;
      if (heads.some((point) => point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom)) return true;
      if (hitsControls(box as DOMRect)) return true;
      return !!attrib && box.left < attrib.right && box.right > attrib.left && box.top < attrib.bottom && box.bottom > attrib.top;
    };
    const covered = (box: { left: number; right: number; top: number; bottom: number }) =>
      samples.reduce((count, point) => count + (point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom ? 1 : 0), 0);
    const inside = (box: { left: number; right: number; top: number; bottom: number }) =>
      box.left >= limits.left - 1 && box.right <= limits.right + 1 && box.top >= limits.top - 1 && box.bottom <= limits.bottom + 1;
    const current = shifted(rect, dx, dy);
    if (inside(current) && !blocked(current) && covered(current) === 0) return { dx, dy };
    const width = rect.width;
    const height = rect.height;
    // A point card stays beside its pin. A route card may sit in a corner so the line stays visible.
    const spots =
      samples.length === 0
        ? [{ dx, dy }]
        : [
            { dx, dy },
            { dx: limits.left - rect.left, dy: limits.top - rect.top },
            { dx: limits.right - width - rect.left, dy: limits.top - rect.top },
            { dx: limits.left - rect.left, dy: limits.bottom - height - rect.top },
            { dx: limits.right - width - rect.left, dy: limits.bottom - height - rect.top },
          ];
    if (pin && pin.width > 2) {
      const box = shifted(rect, dx, dy);
      if (samples.length === 0) {
        const nudgeLeft = box.right - (pin.left - 10);
        const nudgeRight = pin.right + 10 - box.left;
        const nudgeUp = box.bottom - (pin.top - 10);
        const nudgeDown = pin.bottom + 10 - box.top;
        if (nudgeLeft > 0 && nudgeLeft <= 48) spots.push({ dx: dx - nudgeLeft, dy });
        if (nudgeRight > 0 && nudgeRight <= 48) spots.push({ dx: dx + nudgeRight, dy });
        if (nudgeUp > 0 && nudgeUp <= 48) spots.push({ dx, dy: dy - nudgeUp });
        if (nudgeDown > 0 && nudgeDown <= 48) spots.push({ dx, dy: dy + nudgeDown });
      } else {
        spots.push({ dx: dx + (pin.left - 10 - box.right), dy });
        spots.push({ dx: dx + (pin.right + 10 - box.left), dy });
      }
    }
    let best = { dx, dy, score: covered(current) + (blocked(current) || !inside(current) ? 100000 : 0) };
    for (const spot of spots) {
      const box = shifted(rect, spot.dx, spot.dy);
      if (!inside(box) || blocked(box)) continue;
      const score = covered(box);
      if (score < best.score) best = { dx: spot.dx, dy: spot.dy, score };
    }
    return { dx: best.dx, dy: best.dy };
  }

  function clearFramePadding() {
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  }

  function framePadding(bottomExtra = 64): { top: number; bottom: number; left: number; right: number } {
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
        // Extra inset so an arrowhead on the padding edge clears the sheet.
        bottom: Math.max(16, window.innerHeight - sheetBox.top + bottomExtra),
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

/** Portrait always uses the bottom sheet. Short landscape uses the side sheet. */
function useSheet(): boolean {
  if (window.innerHeight > window.innerWidth) return true;
  return window.innerHeight <= 620;
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
    const element = document.querySelector(selector);
    if (element?.classList.contains('is-hidden')) return false;
    const control = visibleRect(element);
    if (!control || control.bottom < 0) return false;
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

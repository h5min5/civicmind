"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ComplaintRecord } from "@/lib/api";
import { categoryLabel, formatWhen, labelize } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

const MUMBAI: L.LatLngExpression = [19.076, 72.8777];
const MUMBAI_BOUNDS = L.latLngBounds([
  [18.89, 72.77],
  [19.3, 73.05],
]);

const SEVERITY_COLOR: Record<string, string> = {
  low: "#7dcea0",
  medium: "#3ddc84",
  high: "#e0b15a",
  critical: "#ff7a7a",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function tip(item: ComplaintRecord) {
  return `
    <div class="map-tip-body">
      <strong>${escapeHtml(labelize(item.issue_type))}</strong>
      <span>${escapeHtml(item.area || "Area unknown")}</span>
      <span>${escapeHtml(categoryLabel(item.issue_category))} · ${escapeHtml(item.severity)}</span>
      <p>${escapeHtml(item.description)}</p>
      <small>${escapeHtml(formatWhen(item.timestamp))}</small>
    </div>
  `;
}

function spread(points: ComplaintRecord[]) {
  const groups = new Map<string, ComplaintRecord[]>();
  for (const item of points) {
    const key = `${item.latitude.toFixed(5)},${item.longitude.toFixed(5)}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return points.map((item) => {
    const key = `${item.latitude.toFixed(5)},${item.longitude.toFixed(5)}`;
    const group = groups.get(key) ?? [item];
    const index = group.indexOf(item);
    if (group.length < 2) return { item, latitude: item.latitude, longitude: item.longitude };
    const angle = (index / group.length) * Math.PI * 2;
    const meters = 16;
    const latitude = item.latitude + (meters * Math.cos(angle)) / 111320;
    const longitude =
      item.longitude + (meters * Math.sin(angle)) / (111320 * Math.cos((item.latitude * Math.PI) / 180));
    return { item, latitude, longitude };
  });
}

function draw(map: LeafletMap, layer: LayerGroup, complaints: ComplaintRecord[], fitted: { current: boolean }) {
  layer.clearLayers();
  const points = complaints.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
  const step = map.getZoom() >= 14 ? 0 : map.getZoom() >= 12 ? 0.02 : 0.05;
  const groups = new Map<string, ComplaintRecord[]>();
  for (const item of points) {
    const key = step === 0 ? item.id : `${Math.round(item.latitude / step)}:${Math.round(item.longitude / step)}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  for (const group of groups.values()) {
    const latitude = group.reduce((sum, item) => sum + item.latitude, 0) / group.length;
    const longitude = group.reduce((sum, item) => sum + item.longitude, 0) / group.length;
    if (group.length > 1) {
      const marker = L.circleMarker([latitude, longitude], {
        radius: 15,
        color: "#3ddc84",
        weight: 2,
        fillColor: "#102117",
        fillOpacity: 0.92,
      });
      marker.bindTooltip(`${group.length} complaints`, { className: "map-tip", direction: "top" });
      marker.on("click", () => map.setView([latitude, longitude], Math.min(map.getZoom() + 2, 16)));
      marker.addTo(layer);
      continue;
    }
    const point = group[0];
    const marker = L.circleMarker([point.latitude, point.longitude], {
      radius: 8,
      color: "#07110c",
      weight: 2,
      fillColor: SEVERITY_COLOR[point.severity] ?? "#445D48",
      fillOpacity: 0.95,
    });
    marker.bindTooltip(tip(point), { className: "map-tip", direction: "auto", sticky: false, opacity: 1 });
    marker.on("click", () => marker.openTooltip());
    marker.addTo(layer);
  }
  if (!fitted.current && points.length > 0) {
    const visible = points.filter((item) => MUMBAI_BOUNDS.contains([item.latitude, item.longitude]));
    const focus = visible.length > 0 ? visible : points;
    map.fitBounds(L.latLngBounds(focus.map((item) => [item.latitude, item.longitude] as L.LatLngTuple)), { padding: [28, 28], maxZoom: 13 });
    fitted.current = true;
  }
}

export function ComplaintMap({ complaints }: { complaints: ComplaintRecord[] }) {
  const { t } = useLocale();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const fitted = useRef(false);
  const complaintsRef = useRef(complaints);
  complaintsRef.current = complaints;

  useEffect(() => {
    if (!host.current || mapRef.current) return;
    const map = L.map(host.current, { scrollWheelZoom: true }).setView(MUMBAI, 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;
    const redraw = () => {
      if (mapRef.current && layerRef.current) draw(mapRef.current, layerRef.current, complaintsRef.current, fitted);
    };
    map.on("zoomend", redraw);
    const resize = () => map.invalidateSize();
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    const timer = window.setTimeout(resize, 150);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      fitted.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    draw(map, layer, complaints, fitted);
  }, [complaints]);

  return (
    <div className="map-block">
      <div ref={host} className="map-frame" role="region" aria-label={t("map.label")} />
      <div className="map-legend" aria-hidden="true">
        {Object.entries(SEVERITY_COLOR).map(([severity, color]) => (
          <span key={severity}>
            <i style={{ background: color }} />
            {t(`sev.${severity}`)}
          </span>
        ))}
      </div>
      <p className="hint">{t("map.hint")}</p>
    </div>
  );
}

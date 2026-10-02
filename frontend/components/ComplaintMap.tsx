"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ComplaintRecord } from "@/lib/api";
import { categoryLabel, formatWhen, labelize } from "@/lib/format";

const MUMBAI: L.LatLngExpression = [19.076, 72.8777];
const MUMBAI_BOUNDS = L.latLngBounds([
  [18.89, 72.77],
  [19.3, 73.05],
]);

const SEVERITY_COLOR: Record<string, string> = {
  low: "#445D48",
  medium: "#8A7340",
  high: "#A15C2A",
  critical: "#8F3D32",
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
  const placed = spread(
    complaints.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)),
  );
  for (const point of placed) {
    const html = tip(point.item);
    const marker = L.circleMarker([point.latitude, point.longitude], {
      radius: 8,
      color: "#FFF8F3",
      weight: 2,
      fillColor: SEVERITY_COLOR[point.item.severity] ?? "#445D48",
      fillOpacity: 0.95,
    });
    marker.bindTooltip(html, {
      className: "map-tip",
      direction: "auto",
      sticky: false,
      opacity: 1,
    });
    marker.on("click", () => marker.openTooltip());
    marker.addTo(layer);
  }
  if (!fitted.current && placed.length > 0) {
    const visible = placed.filter((point) => MUMBAI_BOUNDS.contains([point.latitude, point.longitude]));
    const focus = visible.length > 0 ? visible : placed;
    map.fitBounds(
      L.latLngBounds(focus.map((point) => [point.latitude, point.longitude] as L.LatLngTuple)),
      { padding: [28, 28], maxZoom: 13 },
    );
    fitted.current = true;
  }
}

export function ComplaintMap({ complaints }: { complaints: ComplaintRecord[] }) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const fitted = useRef(false);

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
      <div ref={host} className="map-frame" role="region" aria-label="Complaint locations" />
      <div className="map-legend" aria-hidden="true">
        {Object.entries(SEVERITY_COLOR).map(([severity, color]) => (
          <span key={severity}>
            <i style={{ background: color }} />
            {severity}
          </span>
        ))}
      </div>
      <p className="hint">Pan and zoom across the map. Hover or tap a point to read the issue.</p>
    </div>
  );
}

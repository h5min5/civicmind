"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AuthorityIssue } from "@/lib/api";
import { departmentLabel, formatWhen, labelize } from "@/lib/format";

const MUMBAI: L.LatLngExpression = [19.076, 72.8777];
const MUMBAI_BOUNDS = L.latLngBounds([
  [18.89, 72.77],
  [19.3, 73.05],
]);

const SEVERITY_COLOR: Record<string, string> = {
  low: "#7dcea0",
  medium: "#5ce1ff",
  high: "#ffb020",
  critical: "#ff5d73",
};

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function tip(item: AuthorityIssue) {
  return `
    <div class="map-tip-body">
      <strong>${escapeHtml(item.tracking_code || labelize(item.issue_type))}</strong>
      <span>${escapeHtml(item.area || "Area unknown")}</span>
      <span>${escapeHtml(departmentLabel(item.department))} · ${escapeHtml(item.severity)} · priority ${item.priority.score.toFixed(1)}</span>
      <span>${item.report_count} report${item.report_count === 1 ? "" : "s"}</span>
      <small>${escapeHtml(formatWhen(item.last_reported_at))}</small>
    </div>
  `;
}

function clusters(issues: AuthorityIssue[], zoom: number) {
  const step = zoom >= 15 ? 0 : zoom >= 13 ? 0.01 : 0.04;
  if (step === 0) return issues.map((item) => ({ latitude: item.latitude, longitude: item.longitude, items: [item] }));
  const groups = new Map<string, AuthorityIssue[]>();
  for (const item of issues) {
    const key = `${Math.round(item.latitude / step)}:${Math.round(item.longitude / step)}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.values()].map((items) => ({
    latitude: items.reduce((sum, item) => sum + item.latitude, 0) / items.length,
    longitude: items.reduce((sum, item) => sum + item.longitude, 0) / items.length,
    items,
  }));
}

function spread(item: AuthorityIssue, index: number, total: number) {
  if (total < 2) return { latitude: item.latitude, longitude: item.longitude };
  const angle = (index / total) * Math.PI * 2;
  const meters = 22;
  return {
    latitude: item.latitude + (meters * Math.cos(angle)) / 111320,
    longitude: item.longitude + (meters * Math.sin(angle)) / (111320 * Math.cos((item.latitude * Math.PI) / 180)),
  };
}

export function AuthorityMap({
  issues,
  selectedId,
  onSelect,
}: {
  issues: AuthorityIssue[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const fittedKey = useRef("");
  const issuesRef = useRef(issues);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  issuesRef.current = issues;
  selectedRef.current = selectedId;
  onSelectRef.current = onSelect;

  function redraw(fit: boolean) {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const placed = issuesRef.current.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
    const buckets = new Map<string, AuthorityIssue[]>();
    for (const item of placed) {
      const key = `${item.latitude.toFixed(5)},${item.longitude.toFixed(5)}`;
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    }
    const offsets = new Map<string, { latitude: number; longitude: number }>();
    for (const list of buckets.values()) {
      list.forEach((item, index) => offsets.set(item.id, spread(item, index, list.length)));
    }
    for (const group of clusters(placed, map.getZoom())) {
      if (group.items.length > 1 && map.getZoom() < 15) {
        const marker = L.circleMarker([group.latitude, group.longitude], {
          radius: 18,
          color: "#5ce1ff",
          weight: 2,
          fillColor: "#07111c",
          fillOpacity: 0.92,
        });
        marker.bindTooltip(`${group.items.length} incidents`, { className: "map-tip command-tip", direction: "top" });
        marker.on("click", () => map.setView([group.latitude, group.longitude], Math.min(map.getZoom() + 2, 16)));
        marker.addTo(layer);
        continue;
      }
      group.items.forEach((item) => {
        const point = offsets.get(item.id) ?? item;
        const color = SEVERITY_COLOR[item.severity] ?? "#5ce1ff";
        const selected = selectedRef.current === item.id;
        L.circleMarker([point.latitude, point.longitude], {
          radius: selected ? 16 : 11,
          color: color,
          weight: 0,
          fillColor: color,
          fillOpacity: 0.22,
        }).addTo(layer);
        const marker = L.circleMarker([point.latitude, point.longitude], {
          radius: selected ? 9 : 7,
          color: selected ? "#f4fbff" : "#061018",
          weight: 2,
          fillColor: color,
          fillOpacity: 0.95,
        });
        marker.bindTooltip(tip(item), { className: "map-tip command-tip", direction: "auto", opacity: 1 });
        marker.on("click", () => onSelectRef.current?.(item.id));
        marker.addTo(layer);
      });
    }
    const key = placed.map((item) => item.id).sort().join();
    if (fit && placed.length > 0 && fittedKey.current !== key) {
      const visible = placed.filter((item) => MUMBAI_BOUNDS.contains([item.latitude, item.longitude]));
      const focus = visible.length > 0 ? visible : placed;
      map.fitBounds(
        L.latLngBounds(focus.map((item) => [item.latitude, item.longitude] as L.LatLngTuple)),
        { padding: [42, 42], maxZoom: 15 },
      );
      fittedKey.current = key;
    }
  }

  useEffect(() => {
    if (!host.current || mapRef.current) return;
    const map = L.map(host.current, { scrollWheelZoom: true, maxZoom: 16, zoomControl: true }).setView(MUMBAI, 11);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: "&copy; Esri, HERE, Garmin, OpenStreetMap contributors",
      maxZoom: 16,
    }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;
    map.on("zoomend", () => redraw(false));
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(host.current);
    const timer = window.setTimeout(() => {
      map.invalidateSize();
      redraw(true);
    }, 180);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      fittedKey.current = "";
    };
  }, []);

  useEffect(() => {
    redraw(true);
  }, [issues, selectedId]);

  return (
    <div className="ops-map">
      <div ref={host} className="map-frame command-map" role="region" aria-label="Incident map" />
      <div className="map-hud">
        <span className="live-dot" aria-hidden="true" />
        <span>{issues.length} {issues.length === 1 ? "incident" : "incidents"} plotted</span>
      </div>
      <div className="map-legend command-legend" aria-hidden="true">
        {Object.entries(SEVERITY_COLOR).map(([severity, color]) => (
          <span key={severity}>
            <i style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
            {severity}
          </span>
        ))}
      </div>
      {issues.length === 0 && (
        <div className="map-empty">
          <strong>No reports plotted</strong>
          <p>Incidents show up here once a complaint in this workspace has a location.</p>
        </div>
      )}
    </div>
  );
}

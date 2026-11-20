"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import { lookupArea } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import type { Coords } from "@/lib/locate";

const MUMBAI: L.LatLngExpression = [19.076, 72.8777];

export function LocationPicker({ coords, onChange }: { coords: Coords | null; onChange: (coords: Coords) => void }) {
  const { t } = useLocale();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const onChangeRef = useRef(onChange);
  const initialRef = useRef(coords);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current || mapRef.current) return;
    const start = initialRef.current;
    const map = L.map(host.current, { scrollWheelZoom: true }).setView(
      start ? [start.latitude, start.longitude] : MUMBAI,
      start ? 16 : 12,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    map.on("click", (event) => {
      void (async () => {
        let area: string | null = null;
        try {
          area = (await lookupArea(event.latlng.lat, event.latlng.lng)).area;
        } catch {
          area = null;
        }
        onChangeRef.current({
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
          accuracy: null,
          area,
        });
      })();
    });
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!coords) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const latlng = L.latLng(coords.latitude, coords.longitude);
    if (!markerRef.current) {
      markerRef.current = L.circleMarker(latlng, {
        radius: 9,
        color: "#07110c",
        weight: 2,
        fillColor: "#3ddc84",
        fillOpacity: 1,
      }).addTo(map);
    } else {
      markerRef.current.setLatLng(latlng);
    }
    const accurate = coords.accuracy != null && coords.accuracy > 0 && coords.accuracy <= 400;
    if (accurate) {
      if (!circleRef.current) {
        circleRef.current = L.circle(latlng, {
          radius: coords.accuracy ?? 0,
          color: "#3ddc84",
          weight: 1,
          fillColor: "#3ddc84",
          fillOpacity: 0.12,
        }).addTo(map);
      } else {
        circleRef.current.setLatLng(latlng);
        circleRef.current.setRadius(coords.accuracy ?? 0);
      }
    } else {
      circleRef.current?.remove();
      circleRef.current = null;
    }
    if (coords.accuracy != null) map.setView(latlng, 18);
    else if (map.getZoom() < 16) map.setView(latlng, 17);
    else if (!map.getBounds().contains(latlng)) map.setView(latlng, Math.max(map.getZoom(), 17));
  }, [coords]);

  return (
    <div className="map-block">
      <div ref={host} className="map-frame picker-map" role="application" aria-label="Map for choosing the complaint location" />
      <p className="hint">{t("form.pinHint")}</p>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import { lookupArea } from "@/lib/api";
import type { Coords } from "@/lib/locate";

const MUMBAI: L.LatLngExpression = [19.076, 72.8777];

export function LocationPicker({ coords, onChange }: { coords: Coords | null; onChange: (coords: Coords) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);
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
    if (!map.getBounds().contains(latlng)) map.setView(latlng, Math.max(map.getZoom(), 15));
  }, [coords]);

  return (
    <div className="map-block">
      <div ref={host} className="map-frame picker-map" role="application" aria-label="Map for choosing the complaint location" />
      <p className="hint">Drop a pin if GPS is off. The server stamps the time when the complaint is accepted.</p>
    </div>
  );
}

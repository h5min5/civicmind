import { lookupArea } from "@/lib/api";

export type Coords = { latitude: number; longitude: number; accuracy: number | null; area: string | null };

export function readBrowserLocation(): Promise<Coords> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("This browser does not provide location."));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
          let area: string | null = null;
          try {
            const found = await lookupArea(position.coords.latitude, position.coords.longitude);
            area = found.area;
          } catch {
            area = null;
          }
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            area,
          });
        })();
      },
      (failure) => {
        reject(new Error(failure.message || "Location permission was denied."));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}

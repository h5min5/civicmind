import { lookupArea } from "@/lib/api";

export type Coords = { latitude: number; longitude: number; accuracy: number | null; area: string | null };

const GPS_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };

async function withStreet(position: GeolocationPosition): Promise<Coords> {
  let area: string | null = null;
  try {
    area = (await lookupArea(position.coords.latitude, position.coords.longitude)).area;
  } catch {
    area = null;
  }
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    area,
  };
}

export function readBrowserLocation(): Promise<Coords> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("This browser does not provide location."));
  }
  return new Promise((resolve, reject) => {
    let best: GeolocationPosition | null = null;
    let settled = false;
    const finish = (position: GeolocationPosition) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      navigator.geolocation.clearWatch(watchId);
      void withStreet(position).then(resolve);
    };
    const fail = (message: string) => {
      if (settled) return;
      if (best) {
        finish(best);
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      navigator.geolocation.clearWatch(watchId);
      reject(new Error(message));
    };
    const timer = window.setTimeout(() => fail("Could not get a precise location. Drop a pin on the map."), 20000);
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!best || position.coords.accuracy < best.coords.accuracy) best = position;
        if (position.coords.accuracy <= 30) finish(position);
      },
      (failure) => fail(failure.message || "Location permission was denied."),
      GPS_OPTIONS,
    );
  });
}

export type Coords = { latitude: number; longitude: number; accuracy: number | null };

export function readBrowserLocation(): Promise<Coords> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("This browser does not provide location."));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (failure) => {
        reject(new Error(failure.message || "Location permission was denied."));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { compressImage } from "@/lib/format";

type Coords = { latitude: number; longitude: number; accuracy: number | null };

type Props = {
  submitting: boolean;
  coords: Coords | null;
  onCoords: (coords: Coords) => void;
  onSubmit: (payload: { text: string; image: File | null }) => Promise<void>;
};

export function ComplaintForm({ submitting, coords, onCoords, onSubmit }: Props) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const prepared = await compressImage(file);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      const url = URL.createObjectURL(prepared);
      previewRef.current = url;
      setImage(prepared);
      setPreview(url);
    } catch (caught) {
      setImage(null);
      setPreview(null);
      setError(caught instanceof Error ? caught.message : "Could not read that photo.");
    }
  }

  function useLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError("This browser does not provide location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLocating(false);
      },
      (failure) => {
        setLocating(false);
        setError(failure.message || "Location permission was denied.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!coords) {
      setError("Use your location before submitting. Coordinates come from the phone, not the AI.");
      return;
    }
    setError(null);
    await onSubmit({ text, image });
  }

  return (
    <form className="card form" onSubmit={submit}>
      <div>
        <p className="eyebrow">New report</p>
        <h2>File a civic complaint</h2>
      </div>
      <label className="field">
        What is happening?
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Example: A deep pothole has opened outside the bus stop and vehicles are swerving into the next lane."
          maxLength={4000}
          required
          minLength={8}
        />
      </label>
      <div className="field">
        <span>Photo, optional</span>
        <div className="photo-actions">
          <label className="button secondary file-button">
            Take photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                void chooseFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          <label className="button secondary file-button">
            Upload photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                void chooseFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="hint">A random photo is rejected even if the text describes a real problem.</p>
        {preview && (
          <div className="preview">
            <img src={preview} alt="Selected complaint photo" />
            <button
              className="ghost"
              type="button"
              onClick={() => {
                if (previewRef.current) URL.revokeObjectURL(previewRef.current);
                previewRef.current = null;
                setPreview(null);
                setImage(null);
              }}
            >
              Remove
            </button>
          </div>
        )}
      </div>
      <div className="field">
        <span>Location</span>
        <button className="button secondary" type="button" onClick={useLocation} disabled={locating || submitting}>
          {locating ? "Finding you…" : "Use my location"}
        </button>
        {coords && (
          <p className="coords">
            <span>Latitude {coords.latitude.toFixed(5)}</span>
            <span>Longitude {coords.longitude.toFixed(5)}</span>
            {coords.accuracy != null && <span>Accuracy ±{Math.round(coords.accuracy)} m</span>}
          </p>
        )}
        <p className="hint">The browser asks for permission. The model is never asked to invent GPS or the time.</p>
      </div>
      {error && <p className="form-error">{error}</p>}
      <button className="button wide" type="submit" disabled={submitting || text.trim().length < 8 || !coords}>
        {submitting ? "Checking the complaint…" : "Submit complaint"}
      </button>
    </form>
  );
}

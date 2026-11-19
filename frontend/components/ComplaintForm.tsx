"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { compressImage } from "@/lib/format";
import { readBrowserLocation, type Coords } from "@/lib/locate";

const LocationPicker = dynamic(() => import("@/components/LocationPicker").then((mod) => mod.LocationPicker), {
  ssr: false,
  loading: () => <div className="map-frame picker-map" role="status">Loading the map…</div>,
});

type SpeechResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };

type SpeechEngine = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechResult) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type Props = {
  submitting: boolean;
  coords: Coords | null;
  onCoords: (coords: Coords) => void;
  onSubmit: (payload: { text: string; image: File | null; language: string }) => Promise<void>;
};

const LANGUAGES = [
  { value: "en", label: "English", speech: "en-IN" },
  { value: "hi", label: "Hindi", speech: "hi-IN" },
  { value: "mr", label: "Marathi", speech: "mr-IN" },
];

export function ComplaintForm({ submitting, coords, onCoords, onSubmit }: Props) {
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("en");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const speechRef = useRef<SpeechEngine | null>(null);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      speechRef.current?.stop();
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

  async function useLocation() {
    setError(null);
    setLocating(true);
    try {
      onCoords(await readBrowserLocation());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Location permission was denied.");
    } finally {
      setLocating(false);
    }
  }

  function toggleVoice() {
    setError(null);
    if (listening) {
      speechRef.current?.stop();
      setListening(false);
      return;
    }
    const browser = window as Window & { SpeechRecognition?: new () => SpeechEngine; webkitSpeechRecognition?: new () => SpeechEngine };
    const Ctor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Ctor) {
      setError("This browser has no voice input. Type the complaint instead.");
      return;
    }
    const engine = new Ctor();
    engine.lang = LANGUAGES.find((item) => item.value === language)?.speech ?? "en-IN";
    engine.interimResults = false;
    engine.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) setText((current) => (current ? `${current} ${transcript}` : transcript));
    };
    engine.onerror = (event) => {
      setListening(false);
      setError(event.error === "not-allowed" ? "Allow the microphone to dictate a complaint." : "Voice input stopped.");
    };
    engine.onend = () => setListening(false);
    speechRef.current = engine;
    engine.start();
    setListening(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!coords) {
      setError("Use GPS or drop a pin before submitting. Coordinates come from the map, not the model.");
      return;
    }
    setError(null);
    await onSubmit({ text, image, language });
  }

  return (
    <form className="card form" id="report" onSubmit={submit}>
      <div>
        <p className="eyebrow">New report</p>
        <h2>File a civic complaint</h2>
      </div>
      <div className="language-row" role="radiogroup" aria-label="Complaint language">
        {LANGUAGES.map((item) => (
          <button
            key={item.value}
            type="button"
            className={language === item.value ? "chip on" : "chip"}
            aria-pressed={language === item.value}
            onClick={() => setLanguage(item.value)}
          >
            {item.label}
          </button>
        ))}
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
      <div className="photo-actions">
        <button className="button secondary" type="button" onClick={toggleVoice} disabled={submitting}>
          {listening ? "Stop listening" : "Speak"}
        </button>
        <p className="hint">Voice uses this browser in English, Hindi, or Marathi. The written text is what gets checked.</p>
      </div>
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
        <p className="hint">A photo is checked against the text. A selfie, a meal, or an unrelated picture is rejected.</p>
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
        <button className="button secondary" type="button" onClick={() => void useLocation()} disabled={locating || submitting}>
          {locating ? "Finding you…" : "Use my location"}
        </button>
        {coords && (
          <p className="coords">
            <strong>{coords.area || "Area name unavailable"}</strong>
            <span>Latitude {coords.latitude.toFixed(5)}</span>
            <span>Longitude {coords.longitude.toFixed(5)}</span>
            {coords.accuracy != null && <span>Accuracy ±{Math.round(coords.accuracy)} m</span>}
          </p>
        )}
        <LocationPicker coords={coords} onChange={onCoords} />
      </div>
      {error && <p className="form-error">{error}</p>}
      <button className="button wide" type="submit" disabled={submitting || text.trim().length < 8 || !coords}>
        {submitting ? "Checking the complaint…" : "Submit complaint"}
      </button>
    </form>
  );
}

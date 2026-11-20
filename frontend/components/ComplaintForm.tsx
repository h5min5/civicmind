"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { transcribeSpeech } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { compressImage } from "@/lib/format";
import { readBrowserLocation, type Coords } from "@/lib/locate";

const LocationPicker = dynamic(() => import("@/components/LocationPicker").then((mod) => mod.LocationPicker), {
  ssr: false,
  loading: () => <div className="map-frame picker-map" role="status">Loading the map…</div>,
});

type Props = {
  submitting: boolean;
  coords: Coords | null;
  onCoords: (coords: Coords) => void;
  onSubmit: (payload: { text: string; image: File | null; language: string }) => Promise<void>;
};

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "mr", label: "Marathi" },
];

export function ComplaintForm({ submitting, coords, onCoords, onSubmit }: Props) {
  const { t } = useLocale();
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("en");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const languageRef = useRef(language);
  languageRef.current = language;

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      if (stopTimerRef.current != null) window.clearTimeout(stopTimerRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
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

  function stopRecording() {
    if (stopTimerRef.current != null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  async function toggleVoice() {
    setError(null);
    setVoiceNote(null);
    if (listening) {
      stopRecording();
      return;
    }
    if (transcribing || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser has no voice input. Type the complaint instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Allow the microphone to dictate a complaint.");
      return;
    }
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime });
    } catch {
      recorder = new MediaRecorder(stream);
    }
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setListening(false);
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      chunksRef.current = [];
      if (blob.size < 800) {
        setError("No words were heard. Speak again, closer to the microphone.");
        return;
      }
      const body = new FormData();
      body.append("audio", blob, "speech.webm");
      body.append("hint", languageRef.current);
      setTranscribing(true);
      void transcribeSpeech(body)
        .then((result) => {
          setText((current) => (current ? `${current} ${result.text}` : result.text));
          if (result.language === "en" || result.language === "hi" || result.language === "mr") {
            setLanguage(result.language);
          }
          if (result.switched) {
            const label = t(`lang.${result.language}`);
            setVoiceNote(t("form.heard", { language: label }));
          }
        })
        .catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : "The recording could not be transcribed.");
        })
        .finally(() => setTranscribing(false));
    };
    streamRef.current = stream;
    recorderRef.current = recorder;
    recorder.start();
    setListening(true);
    stopTimerRef.current = window.setTimeout(() => stopRecording(), 60000);
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
        <p className="eyebrow">{t("form.eyebrow")}</p>
        <h2>{t("form.title")}</h2>
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
            {t(`lang.${item.value}`)}
          </button>
        ))}
      </div>
      <label className="field">
        {t("form.what")}
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
        <button className="button secondary" type="button" onClick={() => void toggleVoice()} disabled={submitting || transcribing}>
          {listening ? t("form.stop") : transcribing ? t("form.detecting") : t("form.speak")}
        </button>
        <p className="hint">{voiceNote ?? t("form.voiceHint")}</p>
      </div>
      <div className="field">
        <span>{t("form.photo")}</span>
        <div className="photo-actions">
          <label className="button secondary file-button">
            {t("form.take")}
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
            {t("form.upload")}
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
        <p className="hint">{t("form.photoHint")}</p>
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
              {t("form.remove")}
            </button>
          </div>
        )}
      </div>
      <div className="field">
        <span>{t("form.location")}</span>
        <button className="button secondary" type="button" onClick={() => void useLocation()} disabled={locating || submitting}>
          {locating ? t("form.finding") : t("form.myLocation")}
        </button>
        {coords && (
          <p className="coords">
            <strong>{coords.area || "Street name unavailable"}</strong>
            <span>Latitude {coords.latitude.toFixed(5)}</span>
            <span>Longitude {coords.longitude.toFixed(5)}</span>
            {coords.accuracy != null && <span>Accuracy ±{Math.round(coords.accuracy)} m</span>}
          </p>
        )}
        <LocationPicker coords={coords} onChange={onCoords} />
      </div>
      {error && <p className="form-error">{error}</p>}
      <button className="button wide" type="submit" disabled={submitting || text.trim().length < 8 || !coords}>
        {submitting ? t("form.checking") : t("form.submit")}
      </button>
    </form>
  );
}

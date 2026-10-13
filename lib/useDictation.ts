"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Speech-to-text through the browser's built-in recognizer (Web Speech API): free,
 * no server, no audio leaves through this app. Safari exposes it as
 * webkitSpeechRecognition; where it's missing, `supported` stays false and the
 * keyboard's own dictation mic is the way to talk.
 *
 * It only fills the text field. Nothing is sent until the owner taps Send.
 */

// The DOM lib doesn't type the Web Speech API; just what this file uses.
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognizer(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDictation(onText: (text: string) => void, onError: (message: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => setSupported(recognizer() !== null), []);
  useEffect(() => () => rec.current?.abort(), []);

  /** Starts listening. What's heard is appended to `base` (the text already typed). */
  const start = useCallback(
    (base: string) => {
      const Ctor = recognizer();
      if (!Ctor || rec.current) return;
      const r = new Ctor();
      r.lang = navigator.language || "en-US";
      r.interimResults = true; // show words as they're recognized
      r.continuous = false; // stop at the first pause
      const prefix = base.trim() ? `${base.trimEnd()} ` : "";
      r.onresult = (e) => {
        let heard = "";
        for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
        onText(prefix + heard.trim());
      };
      r.onerror = (e) => {
        // No speech or a deliberate stop isn't an error worth showing.
        if (e.error === "no-speech" || e.error === "aborted") return;
        onError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "Microphone blocked" : "Failed");
      };
      r.onend = () => {
        rec.current = null;
        setListening(false);
      };
      rec.current = r;
      setListening(true);
      try {
        r.start();
      } catch {
        rec.current = null;
        setListening(false);
        onError("Failed");
      }
    },
    [onText, onError],
  );

  const stop = useCallback(() => rec.current?.stop(), []);

  return { supported, listening, start, stop };
}

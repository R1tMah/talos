"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createDictation, type RecognitionCtor } from "./dictation";

/**
 * Speech-to-text through the browser's built-in recognizer (Web Speech API): free,
 * no server, no audio leaves through this app. Safari exposes it as
 * webkitSpeechRecognition; where it's missing, `supported` stays false and the
 * keyboard's own dictation mic is the way to talk.
 *
 * It only fills the text field. Nothing is sent until the owner taps Send.
 * The on/off rules live in ./dictation (tested without a browser).
 */

function recognizer(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDictation(onText: (text: string) => void, onError: (message: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  // Latest callbacks, so the controller never calls a stale one.
  const cb = useRef({ onText, onError });
  cb.current = { onText, onError };
  const ctl = useRef<ReturnType<typeof createDictation> | null>(null);

  useEffect(() => {
    const Ctor = recognizer();
    setSupported(Ctor !== null);
    if (!Ctor) return;
    const c = createDictation(Ctor, navigator.language || "en-US", {
      onText: (t) => cb.current.onText(t),
      onError: (m) => cb.current.onError(m),
      onListening: setListening,
    });
    ctl.current = c;
    // Leaving the app (switching tabs, locking the phone) turns the mic off.
    const onHidden = () => document.visibilityState === "hidden" && c.stop();
    const onPageHide = () => c.cancel();
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      c.cancel();
      ctl.current = null;
    };
  }, []);

  /** Starts listening. What's heard is appended to `base` (the text already typed). */
  const start = useCallback((base: string) => ctl.current?.start(base), []);
  /** Turns the mic off; the last words may still land for a moment. */
  const stop = useCallback(() => ctl.current?.stop(), []);
  /** Turns the mic off and drops anything still on its way (on Send, or when typing). */
  const cancel = useCallback(() => ctl.current?.cancel(), []);

  return { supported, listening, start, stop, cancel };
}

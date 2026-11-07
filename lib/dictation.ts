/**
 * The dictation state machine, kept apart from React so it can be tested against a
 * recognizer that misbehaves the way real browsers do. Safari in particular can:
 *   - never fire `end` after stop(), leaving the mic "on" forever;
 *   - deliver results after stop(), or after a new session has started;
 *   - fire `error` without a following `end`;
 *   - throw from start()/stop()/abort() when it's in the wrong state.
 *
 * The rules that keep the button honest:
 *   - Only the current session's events count; a replaced or cancelled session is ignored.
 *   - stop() turns the button off at once. The session may still deliver its last words
 *     for a moment, then it is aborted if the browser hasn't ended it.
 *   - cancel() drops the session immediately, with no more text (used on Send).
 *   - start() always works: a stopping or stuck session is aborted first.
 */

export interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
export interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
export interface Recognition {
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
export type RecognitionCtor = new () => Recognition;

export interface DictationHandlers {
  onText(text: string): void;
  onError(message: string): void;
  onListening(listening: boolean): void;
}

/** How long a stopped session may keep delivering its last words before it's aborted. */
export const STOP_GRACE_MS = 1500;

interface Session {
  r: Recognition;
  prefix: string;
  stopping: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
}

export function createDictation(Ctor: RecognitionCtor, lang: string, h: DictationHandlers) {
  let cur: Session | null = null;
  let listening = false;

  const setListening = (v: boolean) => {
    if (listening === v) return;
    listening = v;
    h.onListening(v);
  };
  const quietly = (fn: () => void) => {
    try {
      fn();
    } catch {
      // The recognizer was already stopped or never started; nothing to do.
    }
  };
  /** Forget a session: its events no longer reach the app. */
  const detach = (s: Session) => {
    clearTimeout(s.timer);
    s.r.onresult = s.r.onerror = s.r.onend = null;
    if (cur === s) cur = null;
  };
  const finish = (s: Session) => {
    if (cur !== s) return;
    detach(s);
    setListening(false);
  };

  function cancel() {
    const s = cur;
    if (!s) return;
    detach(s);
    quietly(() => s.r.abort());
    setListening(false);
  }

  function stop() {
    const s = cur;
    if (!s || s.stopping) return;
    s.stopping = true;
    setListening(false);
    quietly(() => s.r.stop());
    s.timer = setTimeout(() => {
      if (cur !== s) return;
      detach(s);
      quietly(() => s.r.abort());
    }, STOP_GRACE_MS);
  }

  /** Starts listening. What's heard is appended to `base` (the text already typed). */
  function start(base: string) {
    if (cur && !cur.stopping) return; // already listening
    cancel(); // a stopping or stuck session never blocks a new one
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = true; // show words as they're recognized
    r.continuous = false; // stop at the first pause
    const s: Session = { r, prefix: base.trim() ? `${base.trimEnd()} ` : "", stopping: false, timer: undefined };
    r.onresult = (e) => {
      if (cur !== s) return;
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      h.onText(s.prefix + heard.trim());
    };
    r.onerror = (e) => {
      if (cur !== s) return;
      // No speech or a deliberate stop isn't an error worth showing.
      if (e.error !== "no-speech" && e.error !== "aborted") {
        h.onError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "Microphone blocked" : "Failed");
      }
      finish(s);
      quietly(() => r.abort());
    };
    r.onend = () => finish(s);
    cur = s;
    setListening(true);
    try {
      r.start();
    } catch {
      finish(s);
      h.onError("Failed");
    }
  }

  return {
    start,
    stop,
    cancel,
    get listening() {
      return listening;
    },
  };
}

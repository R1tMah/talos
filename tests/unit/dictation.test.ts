import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDictation, STOP_GRACE_MS, type Recognition, type RecognitionEvent } from "@/lib/dictation";

// A recognizer that can misbehave the way Safari and Chrome do.
type State = "new" | "started" | "stopping" | "ended" | "aborted";
interface Quirks {
  neverEnds?: boolean; // stop() doesn't lead to `end` (Safari)
  throwOnStart?: boolean;
  throwOnStop?: boolean;
  throwOnAbort?: boolean; // throws when there's nothing to abort (browsers never fail to abort a live session)
}

let instances: FakeRec[] = [];
let quirks: Quirks = {};
let firing: FakeRec | null = null;

class FakeRec implements Recognition {
  lang = "";
  interimResults = false;
  continuous = true;
  onresult: ((e: RecognitionEvent) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  state: State = "new";
  quirks = { ...quirks };
  constructor() {
    instances.push(this);
  }
  /** Is the microphone held by this one? */
  get hot() {
    return this.state === "started" || this.state === "stopping";
  }
  start() {
    if (this.quirks.throwOnStart || this.state !== "new") throw new Error("InvalidStateError");
    this.state = "started";
  }
  stop() {
    if (this.quirks.throwOnStop) throw new Error("InvalidStateError");
    if (this.state === "started") this.state = "stopping";
  }
  abort() {
    if (!this.hot) {
      if (this.quirks.throwOnAbort) throw new Error("InvalidStateError");
      return;
    }
    this.state = "aborted";
    this.onerror?.({ error: "aborted" });
    this.onend?.();
  }
  // What the browser does on its own:
  say(...words: string[]) {
    firing = this;
    this.onresult?.({ resultIndex: 0, results: words.map((w) => ({ isFinal: false, 0: { transcript: w } })) });
    firing = null;
  }
  end() {
    if (!this.hot) return;
    this.state = "ended";
    this.onend?.();
  }
  fail(error: string) {
    this.onerror?.({ error });
  }
}

function setup() {
  const texts: string[] = [];
  const errors: string[] = [];
  const listening: boolean[] = [];
  const d = createDictation(FakeRec, "en-US", {
    onText: (t) => {
      texts.push(t);
      // Only the newest session, while it still holds the mic, may write text.
      const newest = instances.at(-1);
      expect(firing).toBe(newest);
      expect(newest!.hot).toBe(true);
    },
    onError: (m) => errors.push(m),
    onListening: (v) => listening.push(v),
  });
  return { d, texts, errors, listening };
}
const hotCount = () => instances.filter((r) => r.hot).length;
const last = () => instances.at(-1)!;

beforeEach(() => {
  vi.useFakeTimers();
  instances = [];
  quirks = {};
});
afterEach(() => vi.useRealTimers());

describe("Dictation: the normal path", () => {
  it("listens, writes after what was typed, and turns off when the browser ends", () => {
    const { d, texts, listening } = setup();
    d.start("Ate ");
    expect(d.listening).toBe(true);
    last().say("two ", "eggs");
    last().end();
    expect(texts.at(-1)).toBe("Ate two eggs");
    expect(d.listening).toBe(false);
    expect(listening).toEqual([true, false]);
    expect(hotCount()).toBe(0);
  });

  it("keeps the last words that land right after stop", () => {
    const { d, texts } = setup();
    d.start("");
    last().say("hello");
    d.stop();
    expect(d.listening).toBe(false); // the button turns off at once
    last().say("hello world"); // the final result, after stop
    last().end();
    expect(texts.at(-1)).toBe("hello world");
  });
});

describe("Dictation: can always be turned off", () => {
  it("turns off at once even when the browser never ends the session", () => {
    quirks = { neverEnds: true };
    const { d } = setup();
    d.start("");
    d.stop();
    expect(d.listening).toBe(false);
    expect(hotCount()).toBe(1); // still finishing its last words
    vi.advanceTimersByTime(STOP_GRACE_MS);
    expect(hotCount()).toBe(0); // then the mic is released
    expect(last().state).toBe("aborted");
  });

  it("ignores words that arrive after the stop grace period", () => {
    quirks = { neverEnds: true };
    const { d, texts } = setup();
    d.start("");
    last().say("one");
    d.stop();
    vi.advanceTimersByTime(STOP_GRACE_MS);
    const before = texts.length;
    last().say("one two"); // a stray late event
    expect(texts.length).toBe(before);
  });

  it("turns off when stop() itself throws", () => {
    quirks = { throwOnStop: true, throwOnAbort: true };
    const { d } = setup();
    d.start("");
    expect(() => d.stop()).not.toThrow();
    expect(d.listening).toBe(false);
    expect(() => vi.advanceTimersByTime(STOP_GRACE_MS)).not.toThrow();
    expect(() => d.start("")).not.toThrow();
  });

  it("stop and cancel do nothing harmful when idle or repeated", () => {
    const { d, listening } = setup();
    d.stop();
    d.cancel();
    d.start("");
    d.stop();
    d.stop();
    d.cancel();
    d.cancel();
    expect(d.listening).toBe(false);
    expect(listening).toEqual([true, false]);
    expect(hotCount()).toBe(0);
  });
});

describe("Dictation: doesn't act on after it's off", () => {
  it("cancel (Send) drops words still on their way", () => {
    const { d, texts } = setup();
    d.start("");
    last().say("pasta");
    d.cancel();
    const before = texts.length;
    last().say("pasta for dinner");
    last().end();
    expect(texts.length).toBe(before);
    expect(hotCount()).toBe(0);
  });

  it("an error without an end still turns it off, and it can start again", () => {
    const { d, errors } = setup();
    d.start("");
    last().fail("network");
    expect(d.listening).toBe(false);
    expect(errors).toEqual(["Failed"]);
    expect(hotCount()).toBe(0);
    d.start("");
    expect(d.listening).toBe(true);
    expect(instances.length).toBe(2);
  });

  it("names a blocked microphone and says nothing for silence", () => {
    const { d, errors } = setup();
    d.start("");
    last().fail("not-allowed");
    d.start("");
    last().fail("no-speech");
    d.start("");
    last().fail("aborted");
    expect(errors).toEqual(["Microphone blocked"]);
    expect(d.listening).toBe(false);
  });

  it("a start that throws leaves it off with an error", () => {
    quirks = { throwOnStart: true };
    const { d, errors } = setup();
    d.start("");
    expect(d.listening).toBe(false);
    expect(errors).toEqual(["Failed"]);
    quirks = {};
    d.start("");
    expect(d.listening).toBe(true);
  });
});

describe("Dictation: quick taps", () => {
  it("starting twice keeps one session", () => {
    const { d } = setup();
    d.start("");
    d.start("");
    expect(instances.length).toBe(1);
    expect(hotCount()).toBe(1);
  });

  it("starting again while the old one is still stopping replaces it", () => {
    quirks = { neverEnds: true };
    const { d, texts } = setup();
    d.start("");
    const old = last();
    d.stop();
    d.start("new ");
    expect(old.state).toBe("aborted");
    expect(hotCount()).toBe(1);
    expect(d.listening).toBe(true);
    old.say("stale"); // the old one must not write
    last().say("words");
    expect(texts).toEqual(["new words"]);
  });

  it("the old session's late end doesn't turn off the new one", () => {
    quirks = { neverEnds: true };
    const { d } = setup();
    d.start("");
    const old = last();
    d.stop();
    d.start("");
    old.state = "stopping"; // pretend the browser still thinks it's running
    old.end();
    expect(d.listening).toBe(true);
  });

  it("the grace timer of an old session doesn't touch the new one", () => {
    quirks = { neverEnds: true };
    const { d } = setup();
    d.start("");
    d.stop();
    vi.advanceTimersByTime(STOP_GRACE_MS - 1);
    d.start("");
    vi.advanceTimersByTime(STOP_GRACE_MS);
    expect(d.listening).toBe(true);
    expect(last().state).toBe("started");
  });
});

describe("Dictation: random tapping never leaves the mic on", () => {
  // Small seeded PRNG so a failure can be replayed.
  const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  for (const seed of [1, 2, 3, 42, 1337, 2026, 9001, 31337]) {
    it(`seed ${seed}`, () => {
      const rand = rng(seed);
      const { d, listening } = setup();
      for (let step = 0; step < 2000; step++) {
        quirks = { neverEnds: rand() < 0.3, throwOnStop: rand() < 0.05, throwOnAbort: rand() < 0.05, throwOnStart: rand() < 0.03 };
        const any = instances.length ? instances[Math.floor(rand() * instances.length)] : null;
        const x = rand();
        if (x < 0.2) d.start(rand() < 0.5 ? "" : "typed");
        else if (x < 0.35) d.stop();
        else if (x < 0.42) d.cancel();
        else if (x < 0.62) any?.say("w" + step);
        else if (x < 0.72) {
          if (any && !any.quirks.neverEnds) any.end();
        } else if (x < 0.77) any?.fail(rand() < 0.5 ? "network" : "no-speech");
        else vi.advanceTimersByTime(Math.floor(rand() * STOP_GRACE_MS));

        // Never two sessions holding the mic.
        expect(hotCount()).toBeLessThanOrEqual(1);
        // "Listening" is shown only while a session is really running.
        if (d.listening) expect(last().state).toBe("started");
        // The reported state matches the last notification.
        expect(listening.at(-1) ?? false).toBe(d.listening);
        // Notifications alternate; no doubled on/off.
        for (let i = 1; i < listening.length; i++) expect(listening[i]).not.toBe(listening[i - 1]);
      }
      // Tapping off and waiting always releases the mic.
      d.stop();
      vi.advanceTimersByTime(STOP_GRACE_MS);
      expect(d.listening).toBe(false);
      expect(hotCount()).toBe(0);
    });
  }
});

import { describe, expect, it } from "vitest";
import { dateLabelIndexes, placePhaseLabels } from "@/components/WeightChart";

// The owner's phases (Mar 23 to Nov 29, ~251 days) on a phone-width chart: 302px of plot.
const px = (day: number) => 4 + (day / 251) * 302;
const phases = [
  { id: "a", name: "1800 cal", x0: px(0), x1: px(64) }, // Mar 23 – May 25
  { id: "b", name: "2100 cal", x0: px(64), x1: px(144) }, // May 26 – Aug 14
  { id: "c", name: "2250 cal", x0: px(155), x1: px(185) }, // Aug 25 – Sep 23
  { id: "d", name: "2100 cal", x0: px(185), x1: px(212) }, // Sep 24 – Oct 20
  { id: "e", name: "2100 cal", x0: px(219), x1: px(220) }, // Oct 28, one day
  { id: "f", name: "2400 cal", x0: px(244), x1: px(251) }, // Nov 22 – today
];
const RIGHT = 306;
const W = 7; // PHASE_CH

describe("Weight chart: phase names", () => {
  const labels = placePhaseLabels(phases, RIGHT);

  it("labels the wide phases in full, a narrower one by its first word, and skips the rest", () => {
    expect(labels.map((l) => [l.id, l.name])).toEqual([["a", "1800 CAL"], ["b", "2100 CAL"], ["c", "2250"]]);
  });

  it("never lets two names overlap or a name leave its band or the plot", () => {
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i];
      const band = phases.find((p) => p.id === l.id)!;
      const end = l.x + l.name.length * W;
      expect(end).toBeLessThanOrEqual(Math.min(band.x1, RIGHT));
      if (i) expect(l.x).toBeGreaterThan(labels[i - 1].x + labels[i - 1].name.length * W);
    }
  });

  it("skips a phase with no name", () => {
    expect(placePhaseLabels([{ id: "x", name: "", x0: 0, x1: 300 }], RIGHT)).toEqual([]);
  });
});

describe("Weight chart: dates under the axis", () => {
  const spans = (xs: number[], idx: number[]) =>
    idx.map((i) => (i === 0 ? [xs[i], xs[i] + 40] : i === xs.length - 1 ? [xs[i] - 40, xs[i]] : [xs[i] - 20, xs[i] + 20]));
  const noTouch = (xs: number[], idx: number[]) => {
    const s = spans(xs, idx);
    for (let i = 1; i < s.length; i++) expect(s[i][0]).toBeGreaterThanOrEqual(s[i - 1][1]);
  };

  it("spreads a few dates across a phone-width chart without touching", () => {
    const xs = Array.from({ length: 36 }, (_, i) => 8 + i * 8.4);
    const idx = dateLabelIndexes(xs, 302);
    expect(idx[0]).toBe(0);
    expect(idx.at(-1)).toBe(35);
    expect(idx.length).toBeGreaterThanOrEqual(3);
    noTouch(xs, idx);
  });

  it("shows more dates on a wide screen", () => {
    const xs = Array.from({ length: 36 }, (_, i) => 8 + i * 22);
    expect(dateLabelIndexes(xs, 780).length).toBeGreaterThan(dateLabelIndexes(xs.map((x) => x * 0.39), 302).length);
  });

  it("with two weeks, shows each date once", () => {
    expect(dateLabelIndexes([80, 230], 302)).toEqual([0, 1]);
  });

  it("keeps only the newest date when the first and last would collide", () => {
    expect(dateLabelIndexes([100, 130], 302)).toEqual([1]);
  });
});

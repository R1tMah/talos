/**
 * One shared AudioContext. iOS only allows Web Audio after a user gesture,
 * so call `unlockAudio()` synchronously inside a tap handler (Start, Log set).
 */
let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
  } catch {}
}

export function playChime() {
  const ac = ctx;
  if (!ac) return;
  [0, 0.22, 0.44].forEach((t, i) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = i === 2 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, ac.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.18);
    o.connect(g).connect(ac.destination);
    o.start(ac.currentTime + t);
    o.stop(ac.currentTime + t + 0.2);
  });
  navigator.vibrate?.([120, 80, 120]);
}

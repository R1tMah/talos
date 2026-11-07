// The email a future letter arrives in: the owner's words, untouched, with when they
// were written. Plain text and a simple HTML version (paragraphs kept, nothing styled away).

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const longDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(iso));

export function renderLetter(letter: { body: string; written_at: string }, timeZone: string, appUrl: string) {
  const written = longDate(letter.written_at, timeZone);
  const subject = `A letter from you, written ${written}`;
  const text = `Written ${written}\n\n${letter.body}\n\n—\nOpen it in Talos: ${appUrl}/tabs/letters\n`;
  const paragraphs = letter.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;white-space:pre-wrap">${esc(p)}</p>`)
    .join("");
  const html =
    `<div style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.6;color:#1f1a33;max-width:600px;margin:0 auto;padding:24px">` +
    `<p style="margin:0 0 24px;font-family:-apple-system,Segoe UI,sans-serif;font-size:13px;color:#726c8f">Written ${esc(written)}</p>` +
    paragraphs +
    `<p style="margin:32px 0 0;font-family:-apple-system,Segoe UI,sans-serif;font-size:13px"><a href="${esc(appUrl)}/tabs/letters" style="color:#c2477f">Open it in Talos</a></p>` +
    `</div>`;
  return { subject, text, html };
}

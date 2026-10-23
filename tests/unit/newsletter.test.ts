import { describe, expect, it } from "vitest";
import { parseNewsletter } from "@/lib/watch/newsletter";

// The shape of a Morning Brew issue page, cut down: header card, markets, a story,
// a sponsored card, and an editorial card with one ad-tracked link in it.
const CARD = `style="display:block;background-color:#fff;border-radius:15px;border:1px solid #e6e6e6;font-size:16px"`;
const html = `<html><body><h6><span>☕</span> Very vulnerable</h6><script>"border-radius:15px;border:1px solid #e6e6e6 escaped copy"</script>
<table><tr><td ${CARD}><table><tr><td>October 22, 2026</td><td><a href=https://links.morningbrew.com/c/view>View Online</a> | <a href=https://x.com/shop>Shop</a></td></tr></table>
  <p>Presented By</p><a href="https://links.morningbrew.com/c/a?mbadid=1"><img src="https://cdn/logo.png" width="300" alt="Sponsor"></a>
  <p><strong>Buongiorno.</strong> Mozzarella &amp; trucks.</p>
  <p><strong>In today’s newsletter, </strong>we’ll get into:</p><ul><li>The bug</li><li>Musk</li></ul></td></tr>
<tr><td ${CARD}><p style="text-transform:uppercase">Markets</p><table class="markets-table"><tr>
  <td class="markets-ticker-cell"><p>Nasdaq</p></td><td class="markets-value-cell"><p>26,702.86</p></td><td class="markets-bubble-cell"><p>+1.05%</p></td></tr></table>
  <p>Data is provided by someone</p><ul><li><strong>Markets:</strong> Stocks rose.</li></ul></td></tr>
<tr><td ${CARD}><p style="font-size:16px;font-weight:700;text-transform:uppercase">UPDATE NEEDED</p>
  <a href=https://links.morningbrew.com/c/story><p style="font-size:24px;font-weight:700;line-height:26px">About 70% of the internet is in danger</p></a>
  <img src="https://cdn/photo.jpg" width="670" alt="Hacker"><p><span><small><em>Niv Bavarsky</em></small></span></p>
  <p>Developers <a href="https://links.morningbrew.com/c/x">released</a> patches.</p></td></tr>
<tr><td ${CARD}><p style="text-transform:uppercase">Sponsored By Skybound</p><p>Invest now.</p></td></tr>
<tr><td ${CARD}><p style="text-transform:uppercase">recs</p><ul><li><a href="https://links.morningbrew.com/c/r1">Travel picks</a></li>
  <li><a href="https://links.morningbrew.com/c/r2?mbadid=9">A sponsored deal</a></li></ul><p>*A message from our sponsor.</p></td></tr>
</table></body></html>`;

describe("Newsletter parsing", () => {
  const n = parseNewsletter(html, { name: "Morning Brew", url: "https://www.morningbrew.com/issues/latest", markets: true });

  it("reads the header: subject, date, topics, web link", () => {
    expect(n.subject).toBe("Very vulnerable");
    expect(n.date).toBe("October 22, 2026");
    expect(n.topics).toEqual(["The bug", "Musk"]);
    expect(n.link).toBe("https://links.morningbrew.com/c/view");
  });

  it("keeps the newsletter's words and formatting", () => {
    const story = n.sections.find((s) => s.kicker === "UPDATE NEEDED")!;
    expect(story.blocks[0]).toEqual({ t: "h", text: "About 70% of the internet is in danger", href: "https://links.morningbrew.com/c/story" });
    expect(story.blocks[1]).toMatchObject({ t: "img", alt: "Hacker", credit: "Niv Bavarsky" });
    expect(story.blocks[2]).toEqual({ t: "p", runs: [{ text: "Developers " }, { text: "released", href: "https://links.morningbrew.com/c/x" }, { text: " patches." }] });
    expect(n.sections[0].blocks[0]).toEqual({ t: "p", runs: [{ text: "Buongiorno.", b: true }, { text: " Mozzarella & trucks." }] });
  });

  it("reads markets numbers and drops the fine print", () => {
    expect(n.markets).toEqual([{ name: "Nasdaq", value: "26,702.86", change: "+1.05%" }]);
    const m = n.sections.find((s) => s.kicker === "Markets")!;
    expect(JSON.stringify(m.blocks)).not.toContain("Data is provided");
    expect(JSON.stringify(m.blocks)).toContain("Stocks rose.");
  });

  it("leaves out sponsorship: sponsored cards, the presenting logo, ad links, sponsor notes", () => {
    const all = JSON.stringify(n.sections);
    for (const ad of ["Skybound", "Invest now", "Presented By", "Sponsor", "A sponsored deal", "message from our sponsor"]) expect(all).not.toContain(ad);
    expect(all).toContain("Travel picks");
    expect(n.dropped).toBeGreaterThanOrEqual(3);
  });

  it("can leave the markets card out", () => {
    const m = parseNewsletter(html, { name: "Morning Brew", url: "https://x", markets: false });
    expect(m.markets).toEqual([]);
    expect(m.sections.some((s) => s.kicker === "Markets")).toBe(false);
  });

  it("refuses a page it doesn't recognize instead of showing nothing", () => {
    expect(() => parseNewsletter("<html><body><p>Moved</p></body></html>", { name: "x", url: "https://x", markets: true })).toThrow();
  });
});

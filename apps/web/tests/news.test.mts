// Unit checks for news mood, feed parsing and keyword matching. Run: npm run test:unit
import assert from "node:assert/strict";
import { scoreText } from "../src/lib/news/sentiment";
import { matchesKeywords, parseFeed, plain } from "../src/lib/news/feed";

let passed = 0;
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log("  ok", name); };

ok("clear headlines get the right mood", () => {
  assert.equal(scoreText("Bitcoin surges to record high as ETF inflows jump").label, "positive");
  assert.equal(scoreText("Exchange hacked; token plunges amid fraud probe").label, "negative");
  assert.equal(scoreText("Central bank publishes its quarterly minutes").label, "neutral");
});
ok("a negator flips the word after it", () => {
  assert.equal(scoreText("Shares did not fall after the report").label, "positive");
});
ok("whole words only, and the words that drove it are listed", () => {
  const s = scoreText("Falcon fund gains ground");
  assert.deepEqual(s.words, ["gains"]);
});
ok("entities and tags are stripped; nothing is left to render as HTML", () => {
  assert.equal(plain("<p>Fed &amp; ECB &#8217;s view &lt;script&gt;</p>"), "Fed & ECB ’s view");
  assert.equal(plain("<![CDATA[<b>Bold</b> move]]>"), "Bold move");
});
ok("RSS 2.0 items parse; items without a web link are dropped", () => {
  const xml = `<rss><channel><item><title>One &amp; two</title><link>https://ex.test/1</link><description><![CDATA[<p>Sum</p>]]></description>
    <pubDate>Fri, 24 Oct 2026 10:00:00 GMT</pubDate></item><item><title>Bad</title><link>javascript:alert(1)</link></item></channel></rss>`;
  const items = parseFeed(xml);
  assert.equal(items.length, 1);
  assert.deepEqual({ ...items[0], publishedAt: items[0].publishedAt?.toISOString() },
    { title: "One & two", url: "https://ex.test/1", summary: "Sum", publishedAt: "2026-10-24T10:00:00.000Z" });
});
ok("Atom entries parse", () => {
  const xml = `<feed><entry><title>Atom post</title><link rel="alternate" href="https://ex.test/a"/><updated>2026-10-24T09:00:00Z</updated><summary>S</summary></entry></feed>`;
  assert.equal(parseFeed(xml)[0].url, "https://ex.test/a");
});
ok("keywords match whole words, any case", () => {
  assert.deepEqual(matchesKeywords("The Fed holds rates", ["fed", "ecb"]), ["fed"]);
  assert.deepEqual(matchesKeywords("A fedora sale", ["fed"]), []);
  assert.deepEqual(matchesKeywords("S&P 500 slips", ["s&p 500"]), ["s&p 500"]);
});
console.log(`${passed} passed`);

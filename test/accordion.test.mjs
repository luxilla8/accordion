// Browser tests for <accordion-group>. Run with `npm test`.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const script = readFileSync(new URL('../accordion.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../accordion.css', import.meta.url), 'utf8');

const fixture = (attrs = '') => `<!doctype html>
<style>${styles}</style>
<accordion-group id="g" ${attrs}>
  <details id="a" name="x" open><summary>A</summary><div>Alpha<br>Alpha<br>Alpha</div></details>
  <details id="b" name="x"><summary>B</summary><div>Bravo</div></details>
  <details id="c" name="x"><summary>C</summary><div>Charlie
    <accordion-group id="inner"><details id="n"><summary>N</summary><div>Nested</div></details></accordion-group>
  </div></details>
</accordion-group>`;

let browser, page;

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
after(() => browser?.close());

async function load(attrs, { reducedMotion = 'reduce' } = {}) {
  page = await browser.newPage({ reducedMotion });
  await page.setContent(fixture(attrs));
  await page.addScriptTag({ content: script });
  await page.evaluate(() => customElements.whenDefined('accordion-group'));
}

const openIds = () => page.$$eval('#g details', (ds) =>
  ds.filter((d) => d.open && d.closest('accordion-group').id === 'g').map((d) => d.id));

beforeEach(async () => { await page?.close(); });

test('removes native name so the script controls exclusivity', async () => {
  await load();
  assert.equal(await page.$$eval('details[name]', (els) => els.length), 0);
});

test('one at a time by default', async () => {
  await load();
  await page.click('#b > summary');
  assert.deepEqual(await openIds(), ['b']);
  await page.click('#c > summary');
  assert.deepEqual(await openIds(), ['c']);
});

test('clicking an open item closes it', async () => {
  await load();
  await page.click('#a > summary');
  assert.deepEqual(await openIds(), []);
});

test('multiple attribute allows several open', async () => {
  await load('multiple');
  await page.click('#b > summary');
  await page.click('#c > summary');
  assert.deepEqual(await openIds(), ['a', 'b', 'c']);
});

test('removing multiple keeps only the first open item', async () => {
  await load('multiple');
  await page.evaluate(() => { g.openAll(); g.multiple = false; });
  assert.deepEqual(await openIds(), ['a']);
});

test('API accepts element, index and id', async () => {
  await load('multiple');
  await page.evaluate(() => { g.close(g.items[0]); g.open(1); g.toggle('c'); });
  assert.deepEqual(await openIds(), ['b', 'c']);
  assert.equal(await page.evaluate(() => g.isOpen('a')), false);
  await page.evaluate(() => g.closeAll());
  assert.deepEqual(await openIds(), []);
});

test('nested groups are independent', async () => {
  await load();
  assert.deepEqual(await page.evaluate(() => g.items.map((d) => d.id)), ['a', 'b', 'c']);
  await page.click('#c > summary');
  await page.click('#n > summary');
  assert.deepEqual(await openIds(), ['c']);
  assert.equal(await page.evaluate(() => n.open), true);
});

test('fires accordion-toggle with detail', async () => {
  await load();
  const events = await page.evaluate(() => {
    const seen = [];
    g.addEventListener('accordion-toggle', (e) =>
      seen.push([e.detail.item.id, e.detail.open, e.detail.index]));
    g.open('b');
    return seen;
  });
  assert.deepEqual(events, [['a', false, 0], ['b', true, 1]]);
});

test('arrow keys, Home and End move focus between headers', async () => {
  await load();
  await page.focus('#a > summary');
  const focused = () => page.evaluate(() => document.activeElement.parentElement.id);
  await page.keyboard.press('ArrowDown');
  assert.equal(await focused(), 'b');
  await page.keyboard.press('End');
  assert.equal(await focused(), 'c');
  await page.keyboard.press('ArrowDown');
  assert.equal(await focused(), 'a');
  await page.keyboard.press('ArrowUp');
  assert.equal(await focused(), 'c');
  await page.keyboard.press('Home');
  assert.equal(await focused(), 'a');
});

test('Enter and Space toggle the focused item', async () => {
  await load();
  await page.focus('#b > summary');
  await page.keyboard.press('Enter');
  assert.deepEqual(await openIds(), ['b']);
  await page.keyboard.press('Space');
  assert.deepEqual(await openIds(), []);
});

test('hash opens the matching item', async () => {
  await load();
  await page.evaluate(() => { location.hash = 'c'; });
  await page.waitForFunction(() => c.open);
  assert.deepEqual(await openIds(), ['c']);
});

test('opening via details.open still enforces one at a time', async () => {
  await load();
  await page.evaluate(() => { b.open = true; });
  await page.waitForFunction(() => !a.open);
  assert.deepEqual(await openIds(), ['b']);
  assert.equal(await page.evaluate(() => b.dataset.state), 'open');
});

test('animates height, and a second click reverses mid-flight', async () => {
  await load('duration="400"', { reducedMotion: 'no-preference' });
  await page.click('#b > summary');
  const midway = await page.evaluate(() => new Promise((r) =>
    setTimeout(() => r(b.getBoundingClientRect().height), 150)));
  const summary = await page.evaluate(() => b.querySelector('summary').offsetHeight);
  assert.ok(midway > summary, 'panel is growing');
  await page.click('#b > summary');
  assert.equal(await page.evaluate(() => b.dataset.state), 'closed');
  assert.equal(await page.evaluate(() => b.open), true, 'stays open while closing animates');
  await page.waitForFunction(() => !b.open);
  // `a` closed when `b` opened; nothing is left open.
  assert.deepEqual(await openIds(), []);
});

test('works without the script', async () => {
  page = await browser.newPage();
  await page.setContent(fixture());
  await page.click('#b > summary');
  assert.deepEqual(await openIds(), ['b'], 'native name attribute keeps it exclusive');
});

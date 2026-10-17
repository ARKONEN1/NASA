// Screenshots of the app (Ukrainian UI) for the documentation, plus the numbers shown on screen.
// Usage: node docs/tools/shots.cjs <puppeteer-core dir> <browser exe>   (app served on http://localhost:5180)
const path = require('path');
const fs = require('fs');
const puppeteer = require(path.join(process.argv[2], 'node_modules', 'puppeteer-core'));
const OUT = path.join(__dirname, '..', 'img');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.argv[3], headless: true, args: ['--lang=uk-UA'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto('http://localhost:5180/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.setItem('lang', 'uk'); localStorage.removeItem('introHidden'); });
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1500);
  // The sidebar scrolls on its own on desktop; unpin it so element screenshots capture the right area.
  await page.addStyleTag({ content: '.controls{position:static!important;max-height:none!important;overflow:visible!important}' });

  const shot = async (name, selector, opts = {}) => {
    await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'start' }), selector);
    await sleep(opts.wait ?? 600);
    const el = await page.$(selector);
    await el.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 86 });
    console.log('shot', name);
  };
  const waitImgs = () => page.waitForFunction(() => [...document.querySelectorAll('#compare-body img')].every((i) => i.complete && i.naturalWidth > 0), { timeout: 60000 }).catch(() => console.log('  (some images did not load)'));
  const pick = async (body, id, purpose) => {
    await page.evaluate(async (body, id, purpose) => {
      document.querySelector(`[data-body=${body}]`).click();
      await new Promise((r) => setTimeout(r, 300));
      document.querySelector(`.smk[data-id="${id}"]`).click();
      await new Promise((r) => setTimeout(r, 300));
      document.querySelectorAll('.chip')[purpose].click();
    }, body, id, purpose);
    await sleep(800);
    await waitImgs();
    await waitStab();
  };
  const waitStab = () => page.waitForFunction(() => /\d+%/.test(document.querySelector('.stab-line')?.textContent || ''), { timeout: 120000 }).catch(() => console.log('  (stability not ready)'));
  const facts = () => page.evaluate(() => ({
    sites: [...document.querySelectorAll('.site')].map((e) => e.innerText.replace(/\n/g, ' | ')),
    compare: document.querySelector('#compare-body')?.innerText,
    check: document.querySelector('#check')?.innerText,
  }));
  const results = {};

  // 1. Whole first screen.
  await page.screenshot({ path: path.join(OUT, '01-overview.jpg'), type: 'jpeg', quality: 86 });
  console.log('shot 01-overview');
  await shot('02-intro', '#intro');
  await shot('03-site-map-moon', '#site-map');
  await shot('04-purposes', '.controls section:nth-of-type(3)');
  await page.evaluate(() => { document.querySelector('.weights').open = true; });
  await shot('05-weights', '.controls section:nth-of-type(3)');
  await page.evaluate(() => { document.querySelector('.weights').open = false; });
  await shot('06-earth-map-shackleton', '.map-wrap');
  await waitImgs();
  await waitStab();
  results.shackleton_balanced = await facts();
  await shot('07-sites-shackleton', '.panels .panel:first-child');
  await shot('08-compare-shackleton', '#compare');
  await shot('09-check-shackleton', '.check');

  // 2. Mars: Jezero, all conditions.
  await pick('mars', 'jezero', 0);
  await shot('10-site-map-mars', '#site-map');
  await shot('11-earth-map-jezero', '.map-wrap');
  results.jezero_balanced = await facts();
  await shot('12-sites-jezero', '.panels .panel:first-child');
  await shot('13-compare-jezero', '#compare');
  await shot('14-check-jezero', '.check');

  // 3. Mars: Arsia caves, geology.
  await pick('mars', 'arsia', 4);
  await page.evaluate(() => { const c = document.querySelector('#show-caves'); if (!c.checked) c.click(); });
  await shot('15-earth-map-arsia-geology', '.map-wrap');
  results.arsia_geology = await facts();
  await shot('16-sites-arsia-geology', '.panels .panel:first-child');
  await shot('17-compare-arsia-geology', '#compare');
  await shot('18-check-arsia-geology', '.check');
  await shot('24-radar-detail-arsia', '.cmp-grid');
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('#dossier-btn');
  await page.waitForFunction(() => document.body.classList.contains('printing-dossier'));
  await page.evaluate(() => { document.body.classList.remove = () => {}; });
  await page.emulateMediaType('print');
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
  await sleep(1500);
  await (await page.$('#dossier')).screenshot({ path: path.join(OUT, '25-dossier.jpg'), type: 'jpeg', quality: 86 });
  console.log('shot 25-dossier');
  await page.emulateMediaType('screen');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.addStyleTag({ content: '.controls{position:static!important;max-height:none!important;overflow:visible!important}' });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await sleep(1500);
  await page.evaluate(() => { const c = document.querySelector('#show-caves'); if (c.checked) c.click(); });

  // 4. Mars: Arcadia, ice.
  await pick('mars', 'arcadia', 3);
  await shot('19-earth-map-arcadia-ice', '.map-wrap');
  results.arcadia_ice = await facts();

  // 5. Moon: Shackleton, habitats — the weak case.
  await pick('moon', 'shackleton', 2);
  results.shackleton_habitat = await facts();
  await shot('20-check-shackleton-habitat', '.check');

  // 6. Moon: Hadley, rovers.
  await pick('moon', 'hadley', 1);
  results.hadley_rover = await facts();
  await shot('21-sites-hadley-rover', '.panels .panel:first-child');

  // 6b. Discoveries tour, step 2.
  await page.click('#tour-btn');
  await sleep(1200);
  await page.click('#tour-next');
  await sleep(2500);
  await shot('26-tour', '.map-wrap');
  await page.click('#tour-close');

  // 7. Header with the language switch, and the method section.
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
  const header = await page.$('.top');
  await header.screenshot({ path: path.join(OUT, '22-header.jpg'), type: 'jpeg', quality: 86 });
  await shot('23-method', '#method');

  fs.writeFileSync(path.join(__dirname, '..', 'img', 'results.json'), JSON.stringify(results, null, 1));
  await browser.close();
})();

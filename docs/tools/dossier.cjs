// Save a site dossier exactly as the app prints it.
// Usage: node docs/tools/dossier.cjs <puppeteer-core dir> <browser exe> <hash> <out.pdf> [lang]
const path = require('path');
const puppeteer = require(path.join(process.argv[2], 'node_modules', 'puppeteer-core'));
const [, , , exe, hash, out, lang = 'uk'] = process.argv;
(async () => {
  const browser = await puppeteer.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument((l) => localStorage.setItem('lang', l), lang);
  await page.goto('http://localhost:5180/' + hash, { waitUntil: 'networkidle0' });
  // Wait for the robustness check, then build the dossier without opening the print dialog.
  await page.waitForFunction(() => /\d+%/.test(document.querySelector('.stab-line')?.textContent || ''), { timeout: 120000 });
  await page.evaluate(() => { window.print = () => {}; window.__noPrintCleanup = true; });
  await page.click('#dossier-btn');
  await page.waitForFunction(() => document.body.classList.contains('printing-dossier'), { timeout: 60000 });
  await page.evaluate(() => { const r = document.body.classList.remove.bind(document.body.classList); document.body.classList.remove = () => {}; setTimeout(() => (document.body.classList.remove = r), 5000); });
  await page.emulateMediaType('print');
  await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
  console.log('saved', out);
  await browser.close();
})();

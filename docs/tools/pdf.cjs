// Render web/docs/<lang>.html to PDF (A4, page numbers in the footer). Links stay clickable.
// Usage: node docs/tools/pdf.cjs <puppeteer-core dir> <browser exe> [uk|en]
const path = require('path');
const puppeteer = require(path.join(process.argv[2], 'node_modules', 'puppeteer-core'));
const lang = process.argv[4] || 'uk';
const DOCS = path.join(__dirname, '..', '..', 'web', 'docs');
const OUT = { uk: 'Analog-Atlas-dokumentatsiia.pdf', en: 'Analog-Atlas-report-en.pdf' };
const FOOT = { uk: 'Атлас аналогів · документація · А. Широков', en: 'Analog Atlas · report · A. Shyrokov' };
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.argv[3], headless: true });
  const page = await browser.newPage();
  await page.goto(require('url').pathToFileURL(path.join(DOCS, lang + '.html')).href, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: path.join(__dirname, '..', OUT[lang]),
    format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font-size:8px;color:#888;font-family:Segoe UI,Arial;padding:0 17mm;display:flex;justify-content:space-between"><span>${FOOT[lang]}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  await browser.close();
  console.log('ok', OUT[lang]);
})();

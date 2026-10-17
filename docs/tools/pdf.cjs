// Render docs/documentation-uk.html to PDF (A4, page numbers in the footer).
// Usage: node docs/tools/pdf.cjs <puppeteer-core dir> <browser exe>
const path = require('path');
const puppeteer = require(path.join(process.argv[2], 'node_modules', 'puppeteer-core'));
const DOCS = path.join(__dirname, '..');
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.argv[3], headless: true });
  const page = await browser.newPage();
  await page.goto(require('url').pathToFileURL(path.join(DOCS, 'documentation-uk.html')).href, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: path.join(DOCS, 'Analog-Atlas-dokumentatsiia.pdf'),
    format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#888;font-family:Segoe UI,Arial;padding:0 17mm;display:flex;justify-content:space-between"><span>Атлас аналогів · документація · А. Широков</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  });
  await browser.close();
  console.log('ok');
})();

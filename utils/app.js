// utils/pdf.js
const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

const generatePdfBuffer = async (htmlContent) => {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({ format: 'A4' });

  await browser.close();
  return pdfBuffer;
};

module.exports = generatePdfBuffer;

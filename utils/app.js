// utils/pdf.js
const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
const isLocal = process.env.NODE_ENV !== 'production';

const generatePdfBuffer = async (htmlContent) => {
  const browser = await puppeteer.launch({
    args: isLocal ? [] : chromium.args,
    defaultViewport: isLocal ? null : chromium.defaultViewport,
    executablePath: isLocal
      ? require('puppeteer').executablePath()
      : await chromium.executablePath,
    headless: true,
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({ format: 'A4' });

  await browser.close();
  return pdfBuffer;
};

module.exports = generatePdfBuffer;

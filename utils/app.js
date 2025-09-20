const { default: axios } = require('axios');
const puppeteer = require('puppeteer');

const generatePdfBuffer = async (htmlContent) => {
  const browser = await puppeteer.launch({
    headless: 'new', // Or true
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({ format: 'A4' });

  await browser.close();
  return pdfBuffer;
};


async function addContacts(endpoint, body) {
  try {
    const headers = { "Content-Type": "application/json" };
    const emailResponse = await axios.post(endpoint, body, { headers });
    return emailResponse.data;
  } catch (emailError) {
    console.error("Error sending email:", emailError.response?.data || emailError.message);
    throw emailError;
  }
}


module.exports = { generatePdfBuffer, addContacts };



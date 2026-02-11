const axios = require('axios');

async function sendTestEmail() {
  const url = 'https://email-sender-chi-nine.vercel.app/api/v1/email';
  const payload = {
    email: 'devsusan24@gmail.com',
    subject: 'Test Message from Wholsale Repo',
    data: {
      emailTemplate: `<!doctype html><html><body><h2>Test email</h2><p>This is a test message sent from the Wholsale repository.</p></body></html>`
    }
  };

  try {
    const resp = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
    console.log('Status:', resp.status);
    console.log('Response data:', resp.data);
    if (resp.status === 200 || resp.status === 408) {
      console.log('✅ Test email sent (or queued) successfully.');
      process.exit(0);
    } else {
      console.error('❌ Unexpected response status:', resp.status);
      process.exit(2);
    }
  } catch (err) {
    console.error('❌ Failed to send test email:', err.message || err);
    if (err.response) console.error('Response data:', err.response.data);
    process.exit(1);
  }
}

sendTestEmail();

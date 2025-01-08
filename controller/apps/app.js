const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApBescsmw4DUGR0Tz5oKA
C5coDQeypqYyBbjOToJsirk7OHhTV0p/0rcwhTQyYtZvfljGVryHKGuuDAL2h3hf
ULDXPGI4uW/l1rUzHlrmqyoAtdZR9oAYAabFo3Kutzq7QG41NmaSRX6tlubOqgXF
pRq1Rlxs/GvKqnd6VHDQWWuEweIVaawv3xPG3MDCMmFOyZSs0r+HOPq5ZkDkIvqv
SzStiisd6dhwUcHMSpcVNn0wwCw7dNyDg1q4aX8mFze16NC0jhVSm3e09cGHb4oW
z2JOoed5UPGH8TF8SzQGLwMevgAQ7pD2BZcPfT24vF6/PcWRtQKb4JxzPTUs0zMG
dwIDAQAB
-----END PUBLIC KEY-----`;

const APP_ID = "4a388e84-5edb-4412-a263-0275d898ed9a";

const client = createClient({
  auth: AppStrategy({
    appId: APP_ID,
    publicKey: PUBLIC_KEY
  }),
  modules: { appInstances }
});

client.appInstances.onAppInstanceRemoved(event => {
  console.log(`onAppInstanceRemoved invoked with data:`, event);
  //
  // handle your event here
  //
});

client.appInstances.onAppInstanceInstalled((event) => {
    console.log(event);
    
})

const handleWebhook = async (req, res) => {
  try {
    await client.webhooks.process(req.body);
  } catch (err) {
    console.error(err);
    response
      .status(500)
      .send(`Webhook error: ${err instanceof Error ? err.message : err}`);
    return;
  }

  res.status(200).send();
};

module.exports = { handleWebhook };

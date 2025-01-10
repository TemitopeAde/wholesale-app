const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAhY3Ls4dI9I+97QT9kT6i
Ja/Ac8f64siC2buV4P4+aGf6T9VcD981jGNjqS3ZJxdzwHDPf7nH67PpePEk2ZCx
FKAPSbNkFq9nTnDwk/GPKji9U4EGmWo7r3HtuJjU2ruXaLgE7Coo0wF5hXSjtbgl
PwkM2rthqzabD+d1FvD7peNF+zbo1WLCHq9XSFZLgMw1KMuSr7tr3oQEO8raC3Cq
F0Edtw5rgFaD5m84oxjWA081kW5k3jHLUq9tgCJqArotC0XnqiF20RGUMyxB8rVE
Uv3UR4sP8iSZxhQO1tQZ10EeLNRguAT92T8k9SDN76vDDVdQ4e8jMdqp6BNI7HbV
bQIDAQAB
-----END PUBLIC KEY-----`;
const APP_ID = "ef1724e2-ef96-446a-b563-eb5364bcbbdb";

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

client.appInstances.onAppInstancePaidPlanPurchased((event) => {
    console.log(event);
    
})

client.appInstances.onAppInstancePaidPlanAutoRenewalCancelled((event) => {
    console.log(event);
    
})

const handlePersonalize = async (req, res) => {
  try {
    await client.webhooks.process(req.body);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send(`Webhook error: ${err instanceof Error ? err.message : err}`);
    return;
  }

  res.status(200).send();
};

module.exports = { handlePersonalize };

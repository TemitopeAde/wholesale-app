const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkBQvBYC0mYzIQKkdgc6M
pH70q9y74H6n+YOP8CoQMZua4lP/m84ExYx60Y1sQBqfDC2B4IrCziQuu9GzRsiq
zUFXhswpwkhJsBwm6V4ZRRoUgHsCjEMkh4KfwliKwQGh5hBy/wpt/Z5ADRmWwmeF
zR/aWQQelOQuOazbHBE5/RSlf/ZN+U/NSydPuC3x184Qo/x1x9TTNB42JvXgj4N2
4wpKgP55V0GsbTjba9oltrZfOWwK7HtA3bukaH5ZlLvTjUIlf1/4AkU6owtqQrWX
CXPmB2a6sp3HdJq86p3vkfsl70MLX/iGZQTcwrWjQuJfh49i85pA34iZiKO3uyAP
XwIDAQAB
-----END PUBLIC KEY-----`;
const APP_ID = "70b6e8ef-25b6-4a85-ac76-c19e576df2c1";

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

const handleGoogle = async (req, res) => {
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

module.exports = { handleGoogle };

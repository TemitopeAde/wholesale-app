const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");
const { default: axios } = require("axios");

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

client.appInstances.onAppInstanceInstalled(async (event) => {
  console.log(event);
  let status = {}
  
  const appId = event.data?.appId;
  const instanceId = event.metadata?.instanceId;
  
  const payload = {
    grant_type: "client_credentials",
    client_id: appId,
    client_secret: "53abe43a-17c2-43b7-8012-afa666917f9b",
    instance_id: instanceId,
  };

  const headers = {
    "Content-Type": "application/json",
  };

  try {
    const response = await axios.post("https://www.wixapis.com/oauth2/token", payload, { headers: headers });
    const accessToken = response.data.access_token; 

    const instanceHeader = {
      "Content-Type": "application/json",
      "Authorization": `${accessToken}`
    }

    const instanceResponse = await axios.get(
      "https://www.wixapis.com/apps/v1/instance",
      { headers: instanceHeader } 
    );

    const isFree = instanceResponse?.data?.instance?.isFree;

    if (isFree === false) {
      status.timeStamp = instanceResponse?.data?.instance?.billing?.timeStamp;
      status.expirationDate = instanceResponse?.data?.instance?.billing?.expirationDate;
      status.active = true;
      status.autoRenewing = instanceResponse?.data?.instance?.billing?.autoRenewing;
    } else {
      status.timeStamp = null
      status.expirationDate = null;
      status.active = false;
      status.autoRenewing = false;
    }

    console.log(status);
    
    
    try {
      const email = instanceResponse?.data?.site?.ownerEmail
      const app = instanceResponse?.data?.instance?.appName
      const site = instanceResponse?.data?.site?.url
      const siteId = instanceResponse?.data?.site?.siteId
      const endpoint = "https://www.wixcustomsolutions.com/_functions-dev/contact"
      const appId = APP_ID
      const body = {
        email: email ? email : "", 
        app, 
        site, 
        siteId,
        appId
      };

      if (isFree===false) {
        body.timeStamp = instanceResponse?.data?.instance?.billing?.timeStamp;
        body.expirationDate = instanceResponse?.data?.instance?.billing?.expirationDate;
        body.active = true;
        body.autoRenewing = instanceResponse?.data?.instance?.billing?.autoRenewing;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
  
      if (!response.ok) {
        throw new Error(`Failed to send email: ${response}`);
      }
  
      const data = await response.json();
      console.log("Email sent successfully:", data);
    } catch (error) {
      console.error("Error sending email:", error.message);
    }
  
  
  } catch (error) {
    console.log(error);
  }
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

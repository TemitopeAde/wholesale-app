const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");
const { default: axios } = require("axios");

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAgDiCeyVSupN1GmiIfEvZ
kk1yTbBMablRGTQtYZ0Dzw6JUfBiyKtMdguFWoKIZDcQ5lhqTbSQrboQ27p6bNGT
/klVwyuRO3KCOiBUkrCKMpWRzurT1UggUuPvJlsu+Vm3mhovedD7GmZ8azMrcRkG
jKCywVpeRICsALMZz0pV+cobpDzLXjd3+ZeQ326WoWKbsfX58lCug8uKIBxM9j5q
6UKDmkV5ZpAb6UJPKLb8nil9mp0Zr49ZmKToQ6RudkV0jwyN65UPYX5iZteM6rdw
gknFk2AZU8bE8IHbYWhYXg49PHr0d9UfbbsT/n8hRSlFN84tSQNtKIwIAs/lUiZT
MQIDAQAB
-----END PUBLIC KEY-----`;
const APP_ID = "58199573-6f93-4db3-8145-fd7ee8f9349c";

const client = createClient({
  auth: AppStrategy({
    appId: APP_ID,
    publicKey: PUBLIC_KEY
  }),
  modules: { appInstances }
});

client.appInstances.onAppInstanceRemoved(event => {
  console.log(`onAppInstanceRemoved invoked with data:`, event);
  
});

client.appInstances.onAppInstanceInstalled(async (event) => {
  console.log(event);
  let status = {}
  
  const appId = event.data?.appId;
  const instanceId = event.metadata?.instanceId;
  
  const payload = {
    grant_type: "client_credentials",
    client_id: appId,
    client_secret: "11ed0a28-57f3-46b6-88cb-a76a54b1a914",
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

      const body = {
        email: email ? email : "", 
        app, 
        site, 
        siteId,
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

const handleQuotes = async (req, res) => {
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

module.exports = { handleQuotes };

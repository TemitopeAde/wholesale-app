const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");
const { default: axios } = require("axios");

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvlgpAKMy0dZpbbo8fpoa
XADWARngcVrQoZC0pjgvCbBhjAlNWjcTyNoBRhBNsA1p8hEzN8JYDNEjPRh3TYpG
Ryg78fVNdraDdNl+xo1Fk8Q1BWdphWZ8l8fRfo7gzdUNwpFKX9PxvRxpe9uvgEUu
MLry/zRPs7kbG0/Vur90JpZbkHmjuA7k0BbJKzDmRc6ZcOiu/ZAub9INcukoS4zo
PBTmcHXBuSki62YXNesEF9P/m7HESPn5sjtNN6SGYQMaPqcL+xaV35kyggocr9a1
lNEABOrVgUuxDY0jeKwc+taTp5A0/8nW50qrvEAdS3iya5JPs0x7B76jbqrTjAwJ
MwIDAQAB
-----END PUBLIC KEY-----`;
const APP_ID = "a6479790-e6c2-4193-a839-aa69e4020d8f";

const client = createClient({
  auth: new AppStrategy({
    appId: APP_ID,
    publicKey: PUBLIC_KEY,
  }),
  modules: { appInstances },
});

client.appInstances.onAppInstanceRemoved((event) => {
  console.log(`onAppInstanceRemoved invoked with data:`, event);
  // Handle your event here
});


client.appInstances.onAppInstanceInstalled(async (event) => {
  console.log("Received installation event:", event);

  let status = {};

  const appId = event.data?.appId;
  const instanceId = event.metadata?.instanceId;

  if (!appId || !instanceId) {
    console.error("Missing appId or instanceId in event data.");
    return;
  }

  const payload = {
    grant_type: "client_credentials",
    client_id: "a6479790-e6c2-4193-a839-aa69e4020d8f",
    client_secret: "b9b6b6c7-95ae-420b-8e86-daa7ca245426",
    instance_id: instanceId,
  };

  const headers = { "Content-Type": "application/json" };

  try {
    const tokenResponse = await axios.post("https://www.wixapis.com/oauth2/token", payload, { headers });
    
    if (!tokenResponse.data?.access_token) {
      throw new Error("Failed to obtain access token");
    }

    const accessToken = tokenResponse.data.access_token;

    const instanceHeader = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };

    const instanceResponse = await axios.get("https://www.wixapis.com/apps/v1/instance", { headers: instanceHeader });

    const isFree = instanceResponse?.data?.instance?.isFree;

    status = {
      timeStamp: isFree ? null : instanceResponse?.data?.instance?.billing?.timeStamp,
      expirationDate: isFree ? null : instanceResponse?.data?.instance?.billing?.expirationDate,
      active: !isFree,
      autoRenewing: isFree ? false : instanceResponse?.data?.instance?.billing?.autoRenewing,
    };

    // Prepare data for webhook notification
    const email = instanceResponse?.data?.site?.ownerEmail || "";
    const app = instanceResponse?.data?.instance?.appName;
    const site = instanceResponse?.data?.site?.url;
    const siteId = instanceResponse?.data?.site?.siteId;
    const instanceId = instanceResponse.data?.instance?.instanceId;
    const endpoint = "https://www.wixcustomsolutions.com/_functions-dev/contact";
    const appId = APP_ID

    const body = {
      email: email || "devsusan24@gmail.com",
      app,
      appId,
      site,
      siteId,
      instanceId,
      ...(!isFree && {
        timeStamp: status.timeStamp,
        expirationDate: status.expirationDate,
        active: status.active,
        autoRenewing: status.autoRenewing,
      }),
    };

    try {
      const emailResponse = await axios.post(endpoint, body, { headers });
      
    } catch (emailError) {
      console.error("Error sending email:", emailError.response?.data || emailError.message);
    }
  } catch (error) {
    console.error("Error handling app installation event:", error.response?.data || error.message);
  }
});


client.appInstances.onAppInstancePaidPlanPurchased((event) => {
  console.log(event)
});

client.appInstances.onAppInstancePaidPlanAutoRenewalCancelled((event) => {
  console.log(event);
});

const handleAds = async (req, res) => {
  try {
    await client.webhooks.process(req.body);
  } catch (err) {
    console.error(err);
    res.status(500).send(`Webhook error: ${err instanceof Error ? err.message : err}`);
    return;
  }

  res.status(200).send();
};

module.exports = { handleAds };

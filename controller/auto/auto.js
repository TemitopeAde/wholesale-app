const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");
const { default: axios } = require("axios");

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAiCmHJHomL1g7SWvgd9tu
CKy/WXMAmemd2RfzR+6M4VD76OPswZwofQZPQ8ShMMLJ86MfpWQMIwNZu07F3Waw
+3bWbuZBXspHcAaFMuZq8xTegDS8CSExOgTCjYV/uAJV1YQYfVQTLKFJ4bdlg7lu
oLreUy/lq5zzHols8jZF64PVVEhsi1IPoqBgp3VPqMr+Zn2DODSJpslRcne7Q0FD
mlRS3dGyEGPf7J0Jn/VD6GvSohwWCZcivxfnAIgoCEZUicqLGMrqG29hz/5TWWAj
XhDDwZS8EgYkKQ+3coG87DVLOXRP1CI8t+8x80xYn+fM1VVyG/u/SiyLLYV4qJiQ
7QIDAQAB
-----END PUBLIC KEY-----`;
const APP_ID = "0a3fffa5-066c-4fc3-b7af-7138928b62c1";

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
    client_secret: "38d3af28-c418-498e-87d9-4b3f25e3b380",
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

const handleAuto = async (req, res) => {
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

module.exports = { handleAuto };

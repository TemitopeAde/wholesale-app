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

// Helper function to save/update app instance data via API
async function saveAppInstanceToAPI(instanceData) {
  const endpoint = "https://www.wixcustomsolutions.com/_functions-dev/contact";
  const headers = { "Content-Type": "application/json" };

  try {
    const response = await axios.post(endpoint, instanceData, { headers });
    console.log(`App instance data saved/updated for instanceId: ${instanceData.instanceId}`);
    return response.data;
  } catch (error) {
    console.error("Error saving app instance data:", error.response?.data || error.message);
    throw error;
  }
}

client.appInstances.onAppInstanceRemoved(async (event) => {
  console.log(`onAppInstanceRemoved invoked with data:`, event);
  
  const instanceId = event.metadata?.instanceId;
  
  if (instanceId) {
    const removalData = {
      instanceId: instanceId,
      appId: APP_ID,
      status: 'removed',
      action: 'app_instance_removed',
      timestamp: new Date().toISOString()
    };

    try {
      await saveAppInstanceToAPI(removalData);
    } catch (error) {
      console.error('Error saving removal data:', error);
    }
  }
});

client.appInstances.onAppInstanceInstalled(async (event) => {
  console.log("Received installation event:", event);
  let status = {};
  
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
      "Authorization": `Bearer ${accessToken}`
    };

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
      status.timeStamp = null;
      status.expirationDate = null;
      status.active = false;
      status.autoRenewing = false;
    }

    console.log(status);
    
    // Prepare comprehensive data for API storage
    const email = instanceResponse?.data?.site?.ownerEmail;
    const app = instanceResponse?.data?.instance?.appName;
    const site = instanceResponse?.data?.site?.url;
    const siteId = instanceResponse?.data?.site?.siteId;

    const apiData = {
      // Original fields for backward compatibility
      email: email || "",
      app,
      appId: APP_ID,
      site,
      siteId,
      instanceId,
      
      // Additional fields for comprehensive tracking
      action: 'app_instance_installed',
      isFree: isFree,
      status: 'installed',
      installationTimestamp: new Date().toISOString(),
      
      // Include billing data for paid plans
      ...(isFree === false && {
        timeStamp: status.timeStamp,
        expirationDate: status.expirationDate,
        active: status.active,
        autoRenewing: status.autoRenewing,
      }),
    };

    // Save to API endpoint
    try {
      await saveAppInstanceToAPI(apiData);
      console.log("App instance data saved successfully");
    } catch (apiError) {
      console.error("Error saving to API:", apiError);
    }

  } catch (error) {
    console.error("Error handling app installation event:", error);
  }
});

client.appInstances.onAppInstancePaidPlanPurchased(async (event) => {
  console.log("Paid plan purchased:", event);
  
  const couponName = event.data?.couponName;
  const cycle = event.data?.cycle;
  const expiresOn = event.data?.expiresOn;
  const invoiceId = event.data?.invoiceId;
  const operationTimeStamp = event.data?.operationTimeStamp;
  const vendorProductId = event.data?.vendorProductId;
  const eventType = event.metadata?.eventType;
  const identity = event.metadata?.identity;
  const instanceId = event.metadata?.instanceId;

  console.log("Paid plan details:", {
    couponName,
    cycle,
    expiresOn,
    invoiceId,
    operationTimeStamp,
    vendorProductId,
    eventType,
    identity,
    instanceId
  });

  const appId = "58199573-6f93-4db3-8145-fd7ee8f9349c";
  
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

    console.log({accessToken});

    const instanceHeader = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    };

    const instanceResponse = await axios.get(
      "https://www.wixapis.com/apps/v1/instance",
      { headers: instanceHeader } 
    );

    console.log({instanceResponse});

    const billing = instanceResponse?.data?.instance?.billing;
    const email = instanceResponse?.data?.site?.ownerEmail;
    const app = instanceResponse?.data?.instance?.appName;
    const site = instanceResponse?.data?.site?.url;
    const siteId = instanceResponse?.data?.site?.siteId;

    const paidPlanData = {
      instanceId: instanceId,
      appId: APP_ID,
      email: email || "",
      app,
      site,
      siteId,
      action: 'paid_plan_purchased',
      isFree: false,
      status: 'paid_plan_active',
      timestamp: new Date().toISOString(),
      timeStamp: billing?.timeStamp,
      expirationDate: billing?.expirationDate,
      active: true,
      autoRenewing: billing?.autoRenewing,
      couponName: couponName,
      paymentCycle: cycle,
      planExpiresOn: expiresOn,
      invoiceId: invoiceId,
      purchaseTimestamp: operationTimeStamp,
      vendorProductId: vendorProductId,
      eventType: eventType,
      customerIdentity: identity
    };

    try {
      await saveAppInstanceToAPI(paidPlanData);
      console.log("Paid plan purchase data saved successfully");
    } catch (error) {
      console.error('Error saving paid plan purchase data:', error);
    }
    
  } catch (error) {
    console.error("Error handling paid plan purchase event:", error);
  }
});

client.appInstances.onAppInstancePaidPlanAutoRenewalCancelled(async (event) => {
  console.log("Auto renewal cancelled:", event);
  
  const instanceId = event.metadata?.instanceId;
  
  if (instanceId) {
    const cancellationData = {
      instanceId: instanceId,
      appId: APP_ID,
      action: 'auto_renewal_cancelled',
      autoRenewing: false,
      status: 'auto_renewal_cancelled',
      timestamp: new Date().toISOString(),
      eventData: event.data
    };

    try {
      await saveAppInstanceToAPI(cancellationData);
      console.log("Auto renewal cancellation data saved successfully");
    } catch (error) {
      console.error('Error saving auto renewal cancellation data:', error);
    }
  }
});


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
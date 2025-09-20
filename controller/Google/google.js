const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");
const { default: axios } = require("axios");
const { google } = require('googleapis');
const path = require('path');
const { saveAppInstanceToGoogleSheets } = require("../../utils/google");
const { addContacts } = require("../../utils/app");

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

const userSheet = {
  newUsers: "new users!A:Z",
  newTrial: "new trial!A:Z",
  payments: "payments!A:Z",
  canceledPlans: "canceled plans!A:Z"
}

const client = createClient({
  auth: AppStrategy({
    appId: APP_ID,
    publicKey: PUBLIC_KEY
  }),
  modules: { appInstances }
});

async function saveAppInstanceToAPI(instanceData) {
  const startTime = Date.now();
  const endpoint = "https://www.wixcustomsolutions.com/_functions-dev/savedata";
  const headers = { "Content-Type": "application/json" };

  try {
    const response = await axios.post(endpoint, instanceData, { headers });
    const duration = Date.now() - startTime;

    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    throw error;
  }
}

async function getAccessToken(appId, instanceId) {
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
    const response = await axios.post("https://www.wixapis.com/oauth2/token", payload, { headers });
    return response.data.access_token;
  } catch (error) {
    throw error;
  }
}

async function getInstanceDetails(accessToken) {
  console.log("=== Getting Instance Details ===");

  const instanceHeader = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessToken.substring(0, 10)}...`
  };

  try {
    const instanceResponse = await axios.get(
      "https://www.wixapis.com/apps/v1/instance",
      { headers: { ...instanceHeader, "Authorization": `Bearer ${accessToken}` } }
    );

    return instanceResponse;
  } catch (error) {
    console.log("❌ Failed to get instance details");
    console.log("Error:", error.response?.data || error.message);
    throw error;
  }
}

client.appInstances.onAppInstanceRemoved(async (event) => {
  const instanceId = event.metadata?.instanceId;
  
  if (!instanceId) {
    return;
  }

  const removalData = {
    instanceId: instanceId,
    appId: APP_ID,
    status: 'removed',
    action: 'app_instance_removed',
    timestamp: new Date().toISOString()
  };

  try {
    removalData.sheet = userSheet.canceledPlans;
    saveAppInstanceToAPI(removalData);
    const res = await saveAppInstanceToGoogleSheets(removalData);
    console.log("✅ App instance removal processed successfully");
  } catch (error) {
    console.log("❌ Error processing app instance removal");
    console.error('Detailed error:', error);
  }

  console.log("=== APP INSTANCE REMOVAL EVENT COMPLETE ===\n");
});

client.appInstances.onAppInstanceInstalled(async (event) => {

  let status = {};

  const appId = event.data?.appId;
  const instanceId = event.metadata?.instanceId;

  try {
    const accessToken = await getAccessToken(appId, instanceId);
    const instanceResponse = await getInstanceDetails(accessToken);

    const isFree = instanceResponse?.data?.instance?.isFree;
    if (isFree === false) {

      const billing = instanceResponse?.data?.instance?.billing;
      status.timeStamp = billing?.timeStamp;
      status.expirationDate = billing?.expirationDate;
      status.active = true;
      status.autoRenewing = billing?.autoRenewing;
    } else {
      console.log("🆓 Processing free plan data...");
      status.timeStamp = null;
      status.expirationDate = null;
      status.active = false;
      status.autoRenewing = false;
    }

    const email = instanceResponse?.data?.site?.ownerEmail;
    const app = instanceResponse?.data?.instance?.appName;
    const site = instanceResponse?.data?.site?.url;
    const siteId = instanceResponse?.data?.site?.siteId;

    const apiData = {
      email: email || "",
      app,
      appId: APP_ID,
      site,
      siteId,
      instanceId,

      action: 'app_instance_installed',
      isFree: isFree,
      status: 'installed',
      installationTimestamp: new Date().toISOString(),

      ...(isFree === false && {
        timeStamp: status.timeStamp,
        expirationDate: status.expirationDate,
        active: status.active,
        autoRenewing: status.autoRenewing,
      }),
    };

    const endpoint = "https://www.wixcustomsolutions.com/_functions-dev/contact";
    try {
      addContacts(endpoint, apiData);
    } catch (emailError) {
      console.error("Error sending contact data:", emailError);
    }

    apiData.sheet = userSheet.newUsers;
    try {
      saveAppInstanceToAPI(apiData);
      const res = await saveAppInstanceToGoogleSheets(apiData);
      console.log("✅ App instance installation data saved successfully");
    } catch (apiError) {
      console.log("❌ Error saving installation data to API");
      console.error("API Error details:", apiError);
      throw apiError;
    }

  } catch (error) {
    console.log("❌ Error handling app installation event");
    console.error("Installation error details:", error);
    console.log("Error stack:", error.stack);
  }

  console.log("=== APP INSTANCE INSTALLATION EVENT COMPLETE ===\n");
});

client.appInstances.onAppInstancePaidPlanPurchased(async (event) => {

  const couponName = event.data?.couponName;
  const cycle = event.data?.cycle;
  const expiresOn = event.data?.expiresOn;
  const invoiceId = event.data?.invoiceId;
  const operationTimeStamp = event.data?.operationTimeStamp;
  const vendorProductId = event.data?.vendorProductId;
  const eventType = event.metadata?.eventType;
  const identity = event.metadata?.identity;
  const instanceId = event.metadata?.instanceId;

  try {
    const accessToken = await getAccessToken(APP_ID, instanceId);

    const instanceResponse = await getInstanceDetails(accessToken);

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
      saveAppInstanceToAPI(paidPlanData);
      paidPlanData.sheet = userSheet.payments;
      const res = await saveAppInstanceToGoogleSheets(paidPlanData);
      console.log({ res, paidPlanData });
    } catch (error) {

      throw error;
    }

  } catch (error) {
    console.log(error);

  }

  console.log("=== PAID PLAN PURCHASE EVENT COMPLETE ===\n");
});

client.appInstances.onAppInstancePaidPlanAutoRenewalCancelled(async (event) => {

  const instanceId = event.metadata?.instanceId;

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
    console.log("💾 Saving auto renewal cancellation data...");
    cancellationData.sheet = userSheet.canceledPlans;
    saveAppInstanceToAPI(cancellationData);
    const res = await saveAppInstanceToGoogleSheets(cancellationData);
    console.log({ res, cancellationData });
  } catch (error) {
    console.error('Cancellation save error:', error);
  }

  console.log("=== AUTO RENEWAL CANCELLATION EVENT COMPLETE ===\n");
});

const handleGoogle = async (req, res) => {

  try {
    console.log("🔄 Processing webhook with Wix client...");
    await client.webhooks.process(req.body);
    console.log("✅ Webhook processed successfully");

    console.log("📤 Sending success response (200)");
    res.status(200).send();
  } catch (err) {
    const errorMessage = `Webhook error: ${err instanceof Error ? err.message : err}`;
    res.status(500).send(errorMessage);
    return;
  }

  console.log("=== WEBHOOK REQUEST COMPLETE ===\n");
};

module.exports = { handleGoogle };
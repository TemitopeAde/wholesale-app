const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");
const { default: axios } = require("axios");
const { google } = require('googleapis');
const path = require('path');
const { saveAppInstanceToGoogleSheets } = require("../../utils/google");
const { addContacts } = require("../../utils/app");

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
    client_secret: "f52c65e2-d843-4ba3-9c69-3ac9e7aaf35e",
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

client.appInstances.onAppInstancePlanConvertedToPaid(async (event) => {
  console.log(`onAppInstancePlanConvertedToPaid invoked with data:`, event);
  console.log(`App instance ID:`, event.metadata.instanceId);

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

const handlePersonalize = async (req, res) => {

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

module.exports = { handlePersonalize };
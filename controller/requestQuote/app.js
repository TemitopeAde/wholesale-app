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

console.log("=== Initializing Wix SDK Client ===");
console.log(`App ID: ${APP_ID}`);
console.log(`Public Key Length: ${PUBLIC_KEY.length} characters`);

const client = createClient({
  auth: AppStrategy({
    appId: APP_ID,
    publicKey: PUBLIC_KEY
  }),
  modules: { appInstances }
});

console.log("✅ Wix SDK Client initialized successfully");

// Helper function to save/update app instance data via API
async function saveAppInstanceToAPI(instanceData) {
  const startTime = Date.now();
  console.log("=== API Save Operation Started ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Saving app instance data to API:");
  console.log(JSON.stringify(instanceData, null, 2));
  
  const endpoint = "https://www.wixcustomsolutions.com/_functions-dev/savedata";
  const headers = { "Content-Type": "application/json" };
  
  console.log(`API Endpoint: ${endpoint}`);
  console.log("Request Headers:", JSON.stringify(headers, null, 2));

  try {
    console.log("📤 Making POST request to API...");
    const response = await axios.post(endpoint, instanceData, { headers });
    const duration = Date.now() - startTime;
    
    console.log("✅ API Request successful");
    console.log(`Response Status: ${response.status}`);
    console.log(`Response Time: ${duration}ms`);
    console.log("Response Data:", JSON.stringify(response.data, null, 2));
    console.log(`✅ App instance data saved/updated for instanceId: ${instanceData.instanceId}`);
    
    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log("❌ API Request failed");
    console.log(`Request Duration: ${duration}ms`);
    console.log("Error Details:");
    console.log(`- Status: ${error.response?.status || 'No status'}`);
    console.log(`- Status Text: ${error.response?.statusText || 'No status text'}`);
    console.log(`- Response Data:`, error.response?.data || 'No response data');
    console.log(`- Error Message: ${error.message}`);
    console.log("Full Error Object:", JSON.stringify(error.toJSON ? error.toJSON() : error, null, 2));
    throw error;
  }
}

// Helper function to get access token
async function getAccessToken(appId, instanceId) {
  console.log("=== Getting Access Token ===");
  console.log(`App ID: ${appId}`);
  console.log(`Instance ID: ${instanceId}`);
  
  const payload = {
    grant_type: "client_credentials",
    client_id: appId,
    client_secret: "11ed0a28-57f3-46b6-88cb-a76a54b1a914",
    instance_id: instanceId,
  };

  const headers = {
    "Content-Type": "application/json",
  };

  console.log("Token Request Payload:", JSON.stringify({ ...payload, client_secret: "***REDACTED***" }, null, 2));

  try {
    console.log("📤 Requesting access token from Wix OAuth...");
    const response = await axios.post("https://www.wixapis.com/oauth2/token", payload, { headers });
    console.log("✅ Access token obtained successfully");
    console.log(`Token expires in: ${response.data.expires_in} seconds`);
    return response.data.access_token;
  } catch (error) {
    console.log("❌ Failed to get access token");
    console.log("Error:", error.response?.data || error.message);
    throw error;
  }
}

// Helper function to get instance details
async function getInstanceDetails(accessToken) {
  console.log("=== Getting Instance Details ===");
  
  const instanceHeader = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessToken.substring(0, 10)}...`
  };

  console.log("Request Headers:", JSON.stringify(instanceHeader, null, 2));

  try {
    console.log("📤 Fetching instance details from Wix API...");
    const instanceResponse = await axios.get(
      "https://www.wixapis.com/apps/v1/instance",
      { headers: { ...instanceHeader, "Authorization": `Bearer ${accessToken}` } }
    );
    
    console.log("✅ Instance details retrieved successfully");
    console.log("Instance Response Status:", instanceResponse.status);
    console.log("Instance Data Structure:");
    console.log("- Site ID:", instanceResponse.data?.site?.siteId);
    console.log("- Site URL:", instanceResponse.data?.site?.url);
    console.log("- Owner Email:", instanceResponse.data?.site?.ownerEmail ? "Present" : "Missing");
    console.log("- App Name:", instanceResponse.data?.instance?.appName);
    console.log("- Is Free:", instanceResponse.data?.instance?.isFree);
    console.log("- Billing Info:", instanceResponse.data?.instance?.billing ? "Present" : "Not present");
    
    return instanceResponse;
  } catch (error) {
    console.log("❌ Failed to get instance details");
    console.log("Error:", error.response?.data || error.message);
    throw error;
  }
}

client.appInstances.onAppInstanceRemoved(async (event) => {
  console.log("\n🗑️  === APP INSTANCE REMOVAL EVENT ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Event received:", JSON.stringify(event, null, 2));
  
  const instanceId = event.metadata?.instanceId;
  console.log(`Instance ID: ${instanceId || 'NOT FOUND'}`);
  
  if (!instanceId) {
    console.log("⚠️  Warning: No instanceId found in event metadata");
    console.log("Available metadata:", JSON.stringify(event.metadata, null, 2));
    return;
  }

  console.log("📝 Preparing removal data...");
  const removalData = {
    instanceId: instanceId,
    appId: APP_ID,
    status: 'removed',
    action: 'app_instance_removed',
    timestamp: new Date().toISOString()
  };

  console.log("Removal data prepared:", JSON.stringify(removalData, null, 2));

  try {
    console.log("💾 Saving removal data to API...");
    await saveAppInstanceToAPI(removalData);
    console.log("✅ App instance removal processed successfully");
  } catch (error) {
    console.log("❌ Error processing app instance removal");
    console.error('Detailed error:', error);
  }
  
  console.log("=== APP INSTANCE REMOVAL EVENT COMPLETE ===\n");
});

client.appInstances.onAppInstanceInstalled(async (event) => {
  console.log("\n📥 === APP INSTANCE INSTALLATION EVENT ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Installation event received:", JSON.stringify(event, null, 2));
  
  let status = {};
  
  const appId = event.data?.appId;
  const instanceId = event.metadata?.instanceId;
  
  console.log(`App ID from event: ${appId}`);
  console.log(`Instance ID from event: ${instanceId}`);
  
  if (!appId || !instanceId) {
    console.log("❌ Missing required data in installation event");
    console.log("Event data:", JSON.stringify(event.data, null, 2));
    console.log("Event metadata:", JSON.stringify(event.metadata, null, 2));
    return;
  }

  try {
    // Get access token
    const accessToken = await getAccessToken(appId, instanceId);
    
    // Get instance details
    const instanceResponse = await getInstanceDetails(accessToken);
    
    const isFree = instanceResponse?.data?.instance?.isFree;
    console.log(`🏷️  Plan type: ${isFree ? 'FREE' : 'PAID'}`);

    if (isFree === false) {
      console.log("💳 Processing paid plan data...");
      const billing = instanceResponse?.data?.instance?.billing;
      status.timeStamp = billing?.timeStamp;
      status.expirationDate = billing?.expirationDate;
      status.active = true;
      status.autoRenewing = billing?.autoRenewing;
      
      console.log("Billing details:");
      console.log("- Timestamp:", status.timeStamp);
      console.log("- Expiration:", status.expirationDate);
      console.log("- Auto Renewing:", status.autoRenewing);
    } else {
      console.log("🆓 Processing free plan data...");
      status.timeStamp = null;
      status.expirationDate = null;
      status.active = false;
      status.autoRenewing = false;
    }

    console.log("Final status object:", JSON.stringify(status, null, 2));
    
    // Extract site and app information
    const email = instanceResponse?.data?.site?.ownerEmail;
    const app = instanceResponse?.data?.instance?.appName;
    const site = instanceResponse?.data?.site?.url;
    const siteId = instanceResponse?.data?.site?.siteId;
    
    console.log("📋 Extracted information:");
    console.log("- Email:", email ? `${email.substring(0, 3)}***@***` : "Not provided");
    console.log("- App Name:", app);
    console.log("- Site URL:", site);
    console.log("- Site ID:", siteId);

    // Prepare comprehensive data for API storage
    console.log("📝 Preparing API data...");
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

    console.log("Final API data:", JSON.stringify(apiData, null, 2));

    // Save to API endpoint
    console.log("💾 Saving installation data to API...");
    try {
      await saveAppInstanceToAPI(apiData);
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
  console.log("\n💰 === PAID PLAN PURCHASE EVENT ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Paid plan purchase event:", JSON.stringify(event, null, 2));
  
  // Extract event data
  const couponName = event.data?.couponName;
  const cycle = event.data?.cycle;
  const expiresOn = event.data?.expiresOn;
  const invoiceId = event.data?.invoiceId;
  const operationTimeStamp = event.data?.operationTimeStamp;
  const vendorProductId = event.data?.vendorProductId;
  const eventType = event.metadata?.eventType;
  const identity = event.metadata?.identity;
  const instanceId = event.metadata?.instanceId;

  console.log("📋 Extracted paid plan details:");
  const planDetails = {
    couponName,
    cycle,
    expiresOn,
    invoiceId,
    operationTimeStamp,
    vendorProductId,
    eventType,
    identity,
    instanceId
  };
  console.log(JSON.stringify(planDetails, null, 2));

  if (!instanceId) {
    console.log("❌ No instanceId found in paid plan purchase event");
    return;
  }

  const appId = "58199573-6f93-4db3-8145-fd7ee8f9349c";
  console.log(`Using App ID: ${appId}`);

  try {
    // Get access token
    const accessToken = await getAccessToken(appId, instanceId);
    console.log("✅ Access token obtained for paid plan purchase");

    // Get instance details
    const instanceResponse = await getInstanceDetails(accessToken);
    console.log("✅ Instance details retrieved for paid plan purchase");

    const billing = instanceResponse?.data?.instance?.billing;
    const email = instanceResponse?.data?.site?.ownerEmail;
    const app = instanceResponse?.data?.instance?.appName;
    const site = instanceResponse?.data?.site?.url;
    const siteId = instanceResponse?.data?.site?.siteId;

    console.log("📋 Site and billing information:");
    console.log("- Email:", email ? `${email.substring(0, 3)}***@***` : "Not provided");
    console.log("- App:", app);
    console.log("- Site:", site);
    console.log("- Site ID:", siteId);
    console.log("- Billing present:", !!billing);
    
    if (billing) {
      console.log("- Billing timestamp:", billing.timeStamp);
      console.log("- Billing expiration:", billing.expirationDate);
      console.log("- Auto renewing:", billing.autoRenewing);
    }

    console.log("📝 Preparing paid plan data...");
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

    console.log("Final paid plan data:", JSON.stringify(paidPlanData, null, 2));

    console.log("💾 Saving paid plan purchase data...");
    try {
      await saveAppInstanceToAPI(paidPlanData);
      console.log("✅ Paid plan purchase data saved successfully");
    } catch (error) {
      console.log("❌ Error saving paid plan purchase data to API");
      console.error('API save error:', error);
      throw error;
    }
    
  } catch (error) {
    console.log("❌ Error handling paid plan purchase event");
    console.error("Paid plan purchase error:", error);
    console.log("Error stack:", error.stack);
  }
  
  console.log("=== PAID PLAN PURCHASE EVENT COMPLETE ===\n");
});

client.appInstances.onAppInstancePaidPlanAutoRenewalCancelled(async (event) => {
  console.log("\n🚫 === AUTO RENEWAL CANCELLATION EVENT ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Auto renewal cancellation event:", JSON.stringify(event, null, 2));
  
  const instanceId = event.metadata?.instanceId;
  console.log(`Instance ID: ${instanceId || 'NOT FOUND'}`);
  
  if (!instanceId) {
    console.log("⚠️  Warning: No instanceId found in cancellation event");
    console.log("Available metadata:", JSON.stringify(event.metadata, null, 2));
    return;
  }

  console.log("📝 Preparing cancellation data...");
  const cancellationData = {
    instanceId: instanceId,
    appId: APP_ID,
    action: 'auto_renewal_cancelled',
    autoRenewing: false,
    status: 'auto_renewal_cancelled',
    timestamp: new Date().toISOString(),
    eventData: event.data
  };

  console.log("Cancellation data prepared:", JSON.stringify(cancellationData, null, 2));

  try {
    console.log("💾 Saving auto renewal cancellation data...");
    await saveAppInstanceToAPI(cancellationData);
    console.log("✅ Auto renewal cancellation data saved successfully");
  } catch (error) {
    console.log("❌ Error saving auto renewal cancellation data");
    console.error('Cancellation save error:', error);
  }
  
  console.log("=== AUTO RENEWAL CANCELLATION EVENT COMPLETE ===\n");
});

const handleQuotes = async (req, res) => {
  console.log("\n🌐 === WEBHOOK REQUEST RECEIVED ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Request Method:", req.method);
  console.log("Request URL:", req.url);
  console.log("Request Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Request Body:", JSON.stringify(req.body, null, 2));
  
  try {
    console.log("🔄 Processing webhook with Wix client...");
    await client.webhooks.process(req.body);
    console.log("✅ Webhook processed successfully");
    
    console.log("📤 Sending success response (200)");
    res.status(200).send();
  } catch (err) {
    console.log("❌ Webhook processing failed");
    console.error("Webhook error details:", err);
    console.log("Error type:", typeof err);
    console.log("Error message:", err instanceof Error ? err.message : err);
    console.log("Error stack:", err instanceof Error ? err.stack : 'No stack trace');
    
    const errorMessage = `Webhook error: ${err instanceof Error ? err.message : err}`;
    console.log(`📤 Sending error response (500): ${errorMessage}`);
    res.status(500).send(errorMessage);
    return;
  }
  
  console.log("=== WEBHOOK REQUEST COMPLETE ===\n");
};

// Add startup logs
console.log("=== Wix App Instance Handler Initialized ===");
console.log("Event handlers registered:");
console.log("- ✅ onAppInstanceRemoved");
console.log("- ✅ onAppInstanceInstalled"); 
console.log("- ✅ onAppInstancePaidPlanPurchased");
console.log("- ✅ onAppInstancePaidPlanAutoRenewalCancelled");
console.log("- ✅ handleQuotes webhook handler");
console.log("Ready to process events...\n");

module.exports = { handleQuotes };
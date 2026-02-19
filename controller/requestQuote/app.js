const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances, embeddedScripts } = require("@wix/app-management");
const { default: axios } = require("axios");
const { google } = require('googleapis');
const path = require('path');
const { saveAppInstanceToGoogleSheets } = require("../../utils/google");
const { addContacts } = require("../../utils/app");


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

const userSheet = {
  newUsers: "new users!A:Z",
  newTrial: "new trial!A:Z",
  payments: "payments!A:Z",
  canceledPlans: "canceled plans!A:Z"
}

const client = createClient({
  auth: AppStrategy({
    appId: APP_ID,
    publicKey: PUBLIC_KEY,
  }),
  modules: { appInstances }
});

function getWixClient(instanceId) {
  if (!instanceId) {
    throw new Error('Missing instanceId');
  }

  const wixClient = createClient({
    auth: AppStrategy({
      appId: APP_ID,
      publicKey: PUBLIC_KEY,
      instanceId: instanceId,
      appSecret: "11ed0a28-57f3-46b6-88cb-a76a54b1a914"
    }),
    modules: {
      embeddedScripts,
    },
  });

  return wixClient;
}

const scriptContent = `
  <script accesstoken="true" type="module">
  import { site } from "@wix/site";
  import { createClient } from "@wix/sdk";
  import { products } from '@wix/stores'; // Import the products module

  const myWixClient = createClient({
    auth: site.auth(), // Authenticates the client for site extensions
    host: site.host({ applicationId: "${APP_ID}" }), 
    modules: {
      products, // Include the products module for fetching store data
    }
  });

  export const injectAccessTokenFunction = myWixClient.auth.getAccessTokenInjector();

  async function fetchProducts() {
    try {

      const productsQueryResult = await myWixClient.products
        .queryProducts()
        .find();

      console.log('Successfully fetched products:', productsQueryResult.items);


    } catch (error) {
      console.error('Error fetching products:', error);
    }
  }

  // Ensure the DOM is fully loaded before attempting to fetch products
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fetchProducts); 
  } else {
    fetchProducts(); 
  }
</script>

`;

const scriptProperties = {
  script: scriptContent,
};

async function sendEmail(
  recipient,
  subject,
  formObject
) {
  try {
    const url = "https://email-sender-chi-nine.vercel.app/api/v1/email";
    const body = JSON.stringify({
      email: recipient,
      subject: subject,
      data: formObject,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });

    if (response.status === 200 || response.status === 408) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    return false;
  }
}


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
    client_secret: "11ed0a28-57f3-46b6-88cb-a76a54b1a914",
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

  const client = getWixClient(instanceId);

  try {
    const res = await client.embeddedScripts.embedScript({
      properties: {},
    });

    console.log("Script embedded successfully.", res);
  } catch (error) {
    console.error("Failed to embed script:", error);
  }


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















    const emailTemplate = `
    <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Request a Quote App – Setup Guide</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; color: #2c3e50; background: #f8f9fc; line-height: 1.7; box-sizing: border-box; margin: 0; padding: 0;">

<!-- HERO -->
<header style="background: linear-gradient(135deg, #4361ee 0%, #7209b7 100%); color: #fff; padding: 60px 20px; text-align: center; box-sizing: border-box;">
  <h1 style="font-size: 2.5rem; margin-bottom: 12px; box-sizing: border-box;">Request a Quote App</h1>
  <p style="font-size: 1.15rem; opacity: 0.9; max-width: 640px; margin: 0 auto; box-sizing: border-box;">Complete setup guide for installing, configuring, and using the Request a Quote Wix app with all its widgets and features.</p>
  <a href="https://meetings-na2.hubspot.com/joey-digangi1/wix-app-demo" style="display: inline-block; margin-top: 24px; padding: 16px 40px; background: #fff; color: #7209b7; font-weight: 700; font-size: 1.15rem; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); transition: transform 0.2s; box-sizing: border-box;">Book a Free Live Demo</a>
</header>

<div style="max-width: 960px; margin: 0 auto; padding: 0 24px; box-sizing: border-box;">

<!-- TABLE OF CONTENTS -->
<nav style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 12px; padding: 32px; margin: -40px auto 40px; position: relative; z-index: 1; box-shadow: 0 4px 20px rgba(0,0,0,0.06); box-sizing: border-box;">
  <h2 style="font-size: 1.3rem; margin-bottom: 16px; color: #4361ee; box-sizing: border-box;">Table of Contents</h2>
  <ol style="padding-left: 20px; box-sizing: border-box;">
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#overview" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">App Overview &amp; Widgets</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#installation" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Installation &amp; First Setup</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#manage-products" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Manage Products – Quote Settings Dashboard</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#pdp" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Setting Up the Product Detail Page</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#cart" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Setting Up the Cart Page</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#grid" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Setting Up the Product Grid</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#slider" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Setting Up the Slider Gallery</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#related" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Setting Up Related Products</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#categories" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Setting Up the Categories Page</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#search" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Setting Up the Search Page</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#top-products" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Setting Up Top Products</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#quote-form" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Quote Form Fields Reference</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#email" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Email Configuration</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#styling" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Styling &amp; Customization</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#languages" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Multi-Language Support</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#cart-modes" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Cart Modes: Current Cart vs Quote Cart</a></li>
    <li style="margin-bottom: 6px; box-sizing: border-box;"><a href="#troubleshooting" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Troubleshooting</a></li>
  </ol>
</nav>

<!-- 1. OVERVIEW -->
<section id="overview" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">1. App Overview &amp; Widgets</h2>
  <p style="margin-bottom: 8px; box-sizing: border-box;">The Request a Quote app is a comprehensive Wix e-commerce solution that adds quote request functionality to your online store. It includes <strong>8 widgets</strong> that you can place on any page of your site.</p>

  <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin: 16px 0; box-sizing: border-box;">
    <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 20px; transition: box-shadow 0.2s; box-sizing: border-box;">
      <h4 style="margin-top: 0; color: #4361ee; font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Product Detail Page</h4>
      <p style="font-size: 0.92rem; color: #6c757d; margin: 0; margin-bottom: 8px; box-sizing: border-box;">Full product page with gallery, options, variants, reviews, and quote request form.</p>
    </div>
    <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 20px; transition: box-shadow 0.2s; box-sizing: border-box;">
      <h4 style="margin-top: 0; color: #4361ee; font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Cart Page</h4>
      <p style="font-size: 0.92rem; color: #6c757d; margin: 0; margin-bottom: 8px; box-sizing: border-box;">Cart display with quote form submission, contact info collection, and email notifications.</p>
    </div>
    <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 20px; transition: box-shadow 0.2s; box-sizing: border-box;">
      <h4 style="margin-top: 0; color: #4361ee; font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Product Grid</h4>
      <p style="font-size: 0.92rem; color: #6c757d; margin: 0; margin-bottom: 8px; box-sizing: border-box;">Browse products in a filterable, paginated grid layout with quick view.</p>
    </div>
    <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 20px; transition: box-shadow 0.2s; box-sizing: border-box;">
      <h4 style="margin-top: 0; color: #4361ee; font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Slider Gallery</h4>
      <p style="font-size: 0.92rem; color: #6c757d; margin: 0; margin-bottom: 8px; box-sizing: border-box;">Auto-playing product carousel with navigation arrows and dots.</p>
    </div>
    <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 20px; transition: box-shadow 0.2s; box-sizing: border-box;">
      <h4 style="margin-top: 0; color: #4361ee; font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Related Products</h4>
      <p style="font-size: 0.92rem; color: #6c757d; margin: 0; margin-bottom: 8px; box-sizing: border-box;">Display products from the same collection as the current product.</p>
    </div>
    <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 20px; transition: box-shadow 0.2s; box-sizing: border-box;">
      <h4 style="margin-top: 0; color: #4361ee; font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Categories Page</h4>
      <p style="font-size: 0.92rem; color: #6c757d; margin: 0; margin-bottom: 8px; box-sizing: border-box;">Display all product categories in a browsable grid.</p>
    </div>
    <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 20px; transition: box-shadow 0.2s; box-sizing: border-box;">
      <h4 style="margin-top: 0; color: #4361ee; font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Search Page</h4>
      <p style="font-size: 0.92rem; color: #6c757d; margin: 0; margin-bottom: 8px; box-sizing: border-box;">Full-text product search with filtering and quick view.</p>
    </div>
    <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 20px; transition: box-shadow 0.2s; box-sizing: border-box;">
      <h4 style="margin-top: 0; color: #4361ee; font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Top Products</h4>
      <p style="font-size: 0.92rem; color: #6c757d; margin: 0; margin-bottom: 8px; box-sizing: border-box;">Showcase selected featured products in a carousel.</p>
    </div>
  </div>
</section>

<!-- 2. INSTALLATION -->
<section id="installation" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">2. Installation &amp; First Setup</h2>

  <div style="display: flex; gap: 20px; background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <div style="flex-shrink: 0; width: 44px; height: 44px; background: #4361ee; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1rem; box-sizing: border-box;">1</div>
    <div style="flex: 1; box-sizing: border-box;">
      <h4 style="margin-top: 0; color: #2c3e50; font-size: 1.1rem; font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Install the App</h4>
      <p style="margin-bottom: 8px; box-sizing: border-box;">Install the <strong>Request a Quote</strong> app from the Wix App Market. Once installed, the widgets become available in the Wix Editor under <strong>Add &rarr; App Widgets</strong>.</p>
    </div>
  </div>

  <div style="display: flex; gap: 20px; background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <div style="flex-shrink: 0; width: 44px; height: 44px; background: #4361ee; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1rem; box-sizing: border-box;">2</div>
    <div style="flex: 1; box-sizing: border-box;">
      <h4 style="margin-top: 0; color: #2c3e50; font-size: 1.1rem; font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Add Your Products</h4>
      <p style="margin-bottom: 8px; box-sizing: border-box;">Make sure you have products in your Wix Store. The app reads products directly from your store's catalog automatically.</p>
    </div>
  </div>

  <div style="display: flex; gap: 20px; background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <div style="flex-shrink: 0; width: 44px; height: 44px; background: #4361ee; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1rem; box-sizing: border-box;">3</div>
    <div style="flex: 1; box-sizing: border-box;">
      <h4 style="margin-top: 0; color: #2c3e50; font-size: 1.1rem; font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Configure Quote Settings per Product</h4>
      <p style="margin-bottom: 8px; box-sizing: border-box;">Go to the <strong>Request a Quote &rarr; Manage Products</strong> page in your Wix Dashboard. Here you can toggle <strong>QUOTE ONLY</strong> for each product. When enabled, the product's price is hidden and only the "Request Quote" button is shown. See <a href="#manage-products" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Section 3: Manage Products Dashboard</a> for full details.</p>
    </div>
  </div>

  <div style="display: flex; gap: 20px; background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <div style="flex-shrink: 0; width: 44px; height: 44px; background: #4361ee; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1rem; box-sizing: border-box;">4</div>
    <div style="flex: 1; box-sizing: border-box;">
      <h4 style="margin-top: 0; color: #2c3e50; font-size: 1.1rem; font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Add a Product Detail Page Widget</h4>
      <p style="margin-bottom: 8px; box-sizing: border-box;">Drag the <strong>Product Detail Page</strong> widget onto a page. This is the core widget that displays individual products and handles quote requests. It will automatically load the first product in your store when in the editor.</p>
    </div>
  </div>

  <div style="display: flex; gap: 20px; background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <div style="flex-shrink: 0; width: 44px; height: 44px; background: #4361ee; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1rem; box-sizing: border-box;">5</div>
    <div style="flex: 1; box-sizing: border-box;">
      <h4 style="margin-top: 0; color: #2c3e50; font-size: 1.1rem; font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Add a Cart Page Widget</h4>
      <p style="margin-bottom: 8px; box-sizing: border-box;">Drag the <strong>Cart Page</strong> widget onto a separate page. This is where users review their quote items and submit the quote form. This widget collects all the contact info, address, and additional fields you configure.</p>
    </div>
  </div>

  <div style="display: flex; gap: 20px; background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <div style="flex-shrink: 0; width: 44px; height: 44px; background: #4361ee; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1rem; box-sizing: border-box;">6</div>
    <div style="flex: 1; box-sizing: border-box;">
      <h4 style="margin-top: 0; color: #2c3e50; font-size: 1.1rem; font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Configure Email Recipients</h4>
      <p style="margin-bottom: 8px; box-sizing: border-box;">Open the settings panel of both the Product Detail Page and Cart Page widgets. Set your <strong>notification email addresses</strong> so you receive quote submissions. You can set up to 2 notification emails per widget.</p>
    </div>
  </div>

  <div style="display: flex; gap: 20px; background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <div style="flex-shrink: 0; width: 44px; height: 44px; background: #4361ee; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1rem; box-sizing: border-box;">7</div>
    <div style="flex: 1; box-sizing: border-box;">
      <h4 style="margin-top: 0; color: #2c3e50; font-size: 1.1rem; font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Browse &amp; Display Widgets (Optional)</h4>
      <p style="margin-bottom: 8px; box-sizing: border-box;">Add the <strong>Product Grid</strong>, <strong>Slider Gallery</strong>, <strong>Categories</strong>, or <strong>Search</strong> widgets to help users browse your products. These all link to the Product Detail Page for individual product views.</p>
    </div>
  </div>

  <div style="padding: 16px 20px; border-radius: 8px; margin: 16px 0; font-size: 0.95rem; background: #fef9e7; border-left: 4px solid #f39c12; color: #7d6608; box-sizing: border-box;">
    <strong style="display: block; margin-bottom: 4px; box-sizing: border-box;">Important: URL Routing</strong>
    The Product Detail Page uses URL slugs to determine which product to display on live sites. Products are accessible via <code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">/product-page/your-product-slug</code> or <code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">/products/your-product-slug</code>.
  </div>
</section>

<!-- 3. MANAGE PRODUCTS DASHBOARD -->
<section id="manage-products" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">3. Manage Products – Quote Settings Dashboard</h2>
  <p style="margin-bottom: 8px; box-sizing: border-box;">The <strong>Manage Products</strong> page is a dashboard page within the Request a Quote app where you control quote behavior for each product individually.</p>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">3.1 Accessing the Dashboard</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">Navigate to your Wix Dashboard and find <strong>Request a Quote &rarr; Manage Products</strong> in the left sidebar. This opens the Product Management page.</p>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">3.2 The Product Management Table</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">The dashboard displays a table listing all products from your Wix Store with the following columns:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
      <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Column</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Description</th></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Product Name</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">The name of the product as it appears in your store</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Price</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">The product's listed price</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">SKU</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">The product's SKU code</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">QUOTE ONLY</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">A checkbox toggle to mark the product as quote-only</td></tr>
    </table>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">3.3 The QUOTE ONLY Toggle</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">Checking the <strong>QUOTE ONLY</strong> checkbox for a product changes its behavior on the Product Detail Page:</p>
    <ul style="padding-left: 24px; box-sizing: border-box;">
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Price is hidden</strong> – The product price section is not displayed to visitors</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>"Request Quote" becomes the primary action</strong> – Instead of showing a price and add-to-cart, the product directs users to request a quote</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Cart behavior adapts</strong> – Quote-only products guide users through the quote form flow rather than the standard checkout</li>
    </ul>

    <div style="padding: 16px 20px; border-radius: 8px; margin: 16px 0; font-size: 0.95rem; background: #eaf4fe; border-left: 4px solid #3498db; color: #1a5276; box-sizing: border-box;">
      <strong style="display: block; margin-bottom: 4px; box-sizing: border-box;">How it works:</strong> When the Product Detail Page loads, it checks the quote settings for the current product. If the product is marked as QUOTE ONLY, the price section is hidden automatically. Products that are <em>not</em> marked as QUOTE ONLY display their price normally.
    </div>

    <div style="padding: 16px 20px; border-radius: 8px; margin: 16px 0; font-size: 0.95rem; background: #fef9e7; border-left: 4px solid #f39c12; color: #7d6608; box-sizing: border-box;">
      <strong style="display: block; margin-bottom: 4px; box-sizing: border-box;">Tip:</strong> Use QUOTE ONLY for products where pricing depends on configuration, quantity, or custom requirements – for example, bulk orders, custom-built items, or rental equipment where the final price needs a personalized quote.
    </div>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">3.4 Example Workflow</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <ol style="padding-left: 24px; box-sizing: border-box;">
      <li style="margin-bottom: 8px; box-sizing: border-box;">Go to <strong>Request a Quote &rarr; Manage Products</strong> in your Wix Dashboard</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Find the product you want to make quote-only</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Check the <strong>QUOTE ONLY</strong> checkbox in that product's row</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">The setting is saved automatically</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">On the live site, that product's price is now hidden and visitors are prompted to request a quote instead</li>
    </ol>
  </div>
</section>

<!-- 4. PRODUCT DETAIL PAGE -->
<section id="pdp" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">4. Setting Up the Product Detail Page</h2>
  <p style="margin-bottom: 8px; box-sizing: border-box;">Click on the Product Detail Page widget in the Wix Editor and open its <strong>Settings Panel</strong>. The panel is organized into accordion sections.</p>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">4.1 Product Information</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">Control which product details are visible:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
      <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Toggle</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Description</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Default</th></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Product Name</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Display the product title</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">On</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show SKU</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Display the product SKU code</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">On</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Price</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Display product pricing (sale/regular). Note: products marked as <strong>QUOTE ONLY</strong> in the <a href="#manage-products" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Manage Products dashboard</a> will have their price hidden automatically regardless of this setting.</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">On</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Price Per Unit</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Display per-unit pricing</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Off</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Description</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Display the product description (HTML supported)</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">On</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Product Options</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Display option dropdowns (size, color, etc.)</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">On</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Custom Text Fields</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Allow custom text input from users</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">On</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Quantity Selector</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Allow users to choose quantity</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">On</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Stock Badge</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">In Stock / Out of Stock indicator</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">On</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Thumbnails</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show image thumbnail gallery</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">On</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Additional Info</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Accordion sections (specs, details, etc.)</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">On</td></tr>
    </table>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">4.2 Product Options &amp; Variants</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">Products with options (e.g., Color, Size) display dropdown selectors. When a user selects options:</p>
    <ul style="padding-left: 24px; box-sizing: border-box;">
      <li style="margin-bottom: 8px; box-sizing: border-box;">The matching <strong>variant</strong> is automatically selected</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Price updates to the variant price (if different)</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">SKU updates to the variant SKU</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Stock status updates per variant</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Gallery image changes to the variant's linked media (for color options)</li>
    </ul>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">4.3 Buttons &amp; Actions</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
      <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Toggle</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Description</th></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Add to Cart</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Standard add-to-cart button (uses Wix cart)</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Request Quote</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Opens the quote form for this product</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Wishlist Button</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Heart icon for wishlist</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Share Button</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Share product link</td></tr>
    </table>
    <p style="margin-bottom: 8px; box-sizing: border-box;">You can customize the <strong>Add to Cart label</strong> and <strong>Request Quote label</strong> text.</p>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">4.4 Reviews Section</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">Toggle <strong>Show Reviews</strong> to display product reviews from the Wix Reviews app. Reviews display:</p>
    <ul style="padding-left: 24px; box-sizing: border-box;">
      <li style="margin-bottom: 8px; box-sizing: border-box;">Star rating</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Review text</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Author name and date</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Custom styling (card background, text colors, star color, fonts)</li>
    </ul>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">4.5 Quote Review Section</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">The <strong>Quote Review</strong> tab shows products the user has added to their quote. Toggle what info appears:</p>
    <ul style="padding-left: 24px; box-sizing: border-box;">
      <li style="margin-bottom: 8px; box-sizing: border-box;">Show/hide product name</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Show/hide SKU</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Show/hide quantity</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Show/hide selected variant</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Show/hide selected options</li>
    </ul>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">4.6 Breadcrumbs</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">Enable breadcrumb navigation above the product with customizable:</p>
    <ul style="padding-left: 24px; box-sizing: border-box;">
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Home Text</strong> – Label for the home link (default: "Home")</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Category Text</strong> – Label for the category breadcrumb</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Colors</strong> – Current page text, link, and separator colors</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Font</strong> – Breadcrumb font family</li>
    </ul>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">4.7 Quote Form on Product Page</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">When a user clicks <strong>Request Quote</strong>, a form is shown. This form collects the same fields as the Cart Page form. See <a href="#quote-form" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Section 12: Quote Form Fields Reference</a> for the full list.</p>
    <div style="padding: 16px 20px; border-radius: 8px; margin: 16px 0; font-size: 0.95rem; background: #eaf4fe; border-left: 4px solid #3498db; color: #1a5276; box-sizing: border-box;">
      <strong style="display: block; margin-bottom: 4px; box-sizing: border-box;">Tip:</strong> Configure the form fields, email recipients, and success page URL from the Product Detail Page panel under the quote-related sections.
    </div>
  </div>
</section>

<!-- 5. CART PAGE -->
<section id="cart" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">5. Setting Up the Cart Page</h2>
  <p style="margin-bottom: 8px; box-sizing: border-box;">The Cart Page displays items and collects the full quote form. Click the widget and open its settings panel.</p>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">5.1 General Settings</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
      <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Setting</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Description</th></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Display Name</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Title shown at the top of the cart page</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Language</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Form language: English, Spanish, French, German, or Italian</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Price</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Toggle product prices in cart items</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Item Description</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Toggle item description below product name</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Current Cart Only</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">When checked, only shows the Wix current cart (no quote cart tab)</td></tr>
    </table>

    <div style="padding: 16px 20px; border-radius: 8px; margin: 16px 0; font-size: 0.95rem; background: #fef9e7; border-left: 4px solid #f39c12; color: #7d6608; box-sizing: border-box;">
      <strong style="display: block; margin-bottom: 4px; box-sizing: border-box;">Show Current Cart Only:</strong> If you uncheck this, you need to use the custom Product Detail Page widget from the Request a Quote app. The quote cart only works with items added through the app's "Request Quote" button.
    </div>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">5.2 Email Configuration</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
      <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Setting</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Description</th></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Notification Email 1</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Primary email to receive quote submissions</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Notification Email 2</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Secondary email recipient</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">License Email</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Email tied to your license/account</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Send Feedback Email</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Toggle confirmation email to the customer</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Feedback Email Content</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">HTML template for the customer email</td></tr>
    </table>
    <p style="margin-bottom: 8px; box-sizing: border-box;">See <a href="#email" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Section 13: Email Configuration</a> for template placeholders and details.</p>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">5.3 Form Fields Configuration</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">The Cart Page panel lets you toggle visibility and required status for every form field. You can also customize labels and reorder fields with drag-and-drop. See <a href="#quote-form" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Section 12: Quote Form Fields Reference</a> for the complete list.</p>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">5.4 Form Field Order</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">Drag and drop fields to reorder how they appear on the form. The order is saved automatically. Default order:</p>
    <p style="margin-bottom: 8px; box-sizing: border-box;">Default order: First Name, Last Name, Email, Phone, Company, Address, Additional Info, Event Location, Event Start Time, Event End Time, Setup Start Time, Setup End Time, Checkbox Group 1–4, File Upload 1–2.</p>
  </div>
</section>

<!-- 6. PRODUCT GRID -->
<section id="grid" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">6. Setting Up the Product Grid</h2>

  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">Layout Settings</h3>
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
      <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Setting</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Description</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Default</th></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Items Per Page</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Number of products per page</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">12</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Columns</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Number of columns in the grid</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">3</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Grid Gap</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Spacing between product cards (px)</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">20</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Card Border Radius</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Rounded corners on cards (px)</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">8</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Ribbon Border Radius</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Rounded corners on sale/new ribbons</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">4</td></tr>
    </table>
  </div>

  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">Features</h3>
    <ul style="padding-left: 24px; box-sizing: border-box;">
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Search</strong> – Toggle a search bar above the grid</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Pagination</strong> – Navigate between pages of products</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Quick View</strong> – Click a product to see details in a modal overlay</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Collection Filtering</strong> – Display products from a specific collection</li>
    </ul>
  </div>
</section>

<!-- 7. SLIDER GALLERY -->
<section id="slider" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">7. Setting Up the Slider Gallery</h2>

  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">Carousel Settings</h3>
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
      <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Setting</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Description</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Default</th></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Auto-Play</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Automatically advance slides</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">On</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Auto-Play Interval</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Time between slides (ms)</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">3000</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Arrows</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Display navigation arrows</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">On</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Dots</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Display dot indicators</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">On</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Slide Gap</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Space between slides (px)</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">16</td></tr>
    </table>
  </div>

  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">Styling</h3>
    <p style="margin-bottom: 8px; box-sizing: border-box;">Customize arrows (background, color, hover), dots (color, active color), card styling (background, border, text colors), and product info fonts. The slider also supports a quick view modal.</p>
  </div>
</section>

<!-- 8. RELATED PRODUCTS -->
<section id="related" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">8. Setting Up Related Products</h2>

  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">The Related Products widget automatically displays products from the same collection as the current product on the Product Detail Page.</p>
    <ul style="padding-left: 24px; box-sizing: border-box;">
      <li style="margin-bottom: 8px; box-sizing: border-box;">Same carousel configuration as the Slider Gallery</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Quick view modal with product options and add-to-cart</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Automatic collection detection</li>
    </ul>
    <div style="padding: 16px 20px; border-radius: 8px; margin: 16px 0; font-size: 0.95rem; background: #eaf4fe; border-left: 4px solid #3498db; color: #1a5276; box-sizing: border-box;">
      <strong style="display: block; margin-bottom: 4px; box-sizing: border-box;">Tip:</strong> Place this widget below the Product Detail Page widget on the same page for the best user experience.
    </div>
  </div>
</section>

<!-- 9. CATEGORIES -->
<section id="categories" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">9. Setting Up the Categories Page</h2>

  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">Displays all product categories from your Wix Store as a browsable grid. Users can click a category to see products within it.</p>
    <ul style="padding-left: 24px; box-sizing: border-box;">
      <li style="margin-bottom: 8px; box-sizing: border-box;">Automatic category listing from your store</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Products per category display</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Quick view modal integration</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Pagination support</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Fully styleable cards and layout</li>
    </ul>
  </div>
</section>

<!-- 10. SEARCH -->
<section id="search" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">10. Setting Up the Search Page</h2>

  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">Provides a dedicated search experience for your products.</p>
    <ul style="padding-left: 24px; box-sizing: border-box;">
      <li style="margin-bottom: 8px; box-sizing: border-box;">Full-text search across product names and descriptions</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Customizable search bar placeholder text</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Empty state messaging when no results found</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Quick view modal from search results</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Grid layout for results</li>
    </ul>
  </div>
</section>

<!-- 11. TOP PRODUCTS -->
<section id="top-products" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">11. Setting Up Top Products</h2>

  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">Showcase hand-picked featured products in a carousel.</p>
    <ul style="padding-left: 24px; box-sizing: border-box;">
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Selected Product IDs</strong> – Choose which products to feature</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Max Products</strong> – Limit the number of displayed products</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Title</strong> – Customizable section title</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Same carousel controls as the Slider Gallery (auto-play, arrows, dots)</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Quick view modal and add-to-cart support</li>
    </ul>
  </div>
</section>

<!-- 12. QUOTE FORM FIELDS -->
<section id="quote-form" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">12. Quote Form Fields Reference</h2>
  <p style="margin-bottom: 8px; box-sizing: border-box;">The quote form is available on both the Product Detail Page and the Cart Page. All fields can be toggled visible/hidden and required/optional from the panel.</p>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">12.1 Contact Information <span style="display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 600; vertical-align: middle; background: #fdedec; color: #e74c3c; box-sizing: border-box;">Required</span></h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
      <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Field</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Type</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Notes</th></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">First Name</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Text</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Always required, min 2 characters</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Last Name</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Text</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Always required, min 2 characters</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Email</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Email</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Always required, validated format</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Phone</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Phone</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Always required, custom placeholder supported</td></tr>
    </table>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">12.2 Address Fields <span style="display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 600; vertical-align: middle; background: #eaf
  
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">Toggle <strong>Show Address Fields</strong> in the panel to enable. When enabled, these fields appear:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
      <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Field</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Type</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Notes</th></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Country</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Dropdown</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Populated automatically. Set a default country in the panel.</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">State / Province</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Dropdown</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Cascading: depends on selected country</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">City</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Dropdown</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Cascading: depends on selected state</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Address Line</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Text</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Street address</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Postal Code</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Text</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">ZIP / Postal code</td></tr>
    </table>
    <p style="margin-bottom: 8px; box-sizing: border-box;"><strong>Shipping Address:</strong> If enabled, a "Different shipping address" checkbox appears. When unchecked, a second set of address fields is shown for the shipping address.</p>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">12.3 Optional Fields</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
      <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Field</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Type</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Toggle</th></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Company</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Text</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show/hide + make required</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Additional Info (More Info)</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Text Area</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show/hide + make required</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Event Location</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Text</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show/hide + make required</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Event Start Time</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Date/Time</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show/hide + make required</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Event End Time</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Date/Time</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show/hide + make required</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Setup Start Time</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Date/Time</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show/hide + make required</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Setup End Time</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Date/Time</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show/hide + make required</td></tr>
    </table>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">12.4 Checkbox Groups (1–4)</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">Up to <strong>4 checkbox groups</strong> can be configured. Each group has:</p>
    <ul style="padding-left: 24px; box-sizing: border-box;">
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Label</strong> – Custom heading for the group</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Options</strong> – Comma-separated list or JSON array of choices</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Visibility</strong> – Show or hide the group</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Required</strong> – Make at least one selection required</li>
    </ul>
    <p style="margin-bottom: 8px; box-sizing: border-box;">Example options formats:</p>
    <pre style="background: #1e1e2e; color: #cdd6f4; padding: 20px; border-radius: 8px; overflow-x: auto; margin: 12px 0; font-size: 0.88rem; line-height: 1.6; box-sizing: border-box;">Option A, Option B, Option C</pre>
    <pre style="background: #1e1e2e; color: #cdd6f4; padding: 20px; border-radius: 8px; overflow-x: auto; margin: 12px 0; font-size: 0.88rem; line-height: 1.6; box-sizing: border-box;">["Option A", "Option B", "Option C"]</pre>
    <p style="margin-bottom: 8px; box-sizing: border-box;">Users can select multiple checkboxes per group. Selections are included in the quote email.</p>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">12.5 File Uploads (1–2)</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">Two file upload fields are available. Each has:</p>
    <ul style="padding-left: 24px; box-sizing: border-box;">
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Visibility</strong> – Show or hide</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Required</strong> – Make upload mandatory</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Custom Label</strong> – Field label text</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Max Size</strong> – 10MB per file</li>
    </ul>
    <p style="margin-bottom: 8px; box-sizing: border-box;">Uploaded files are included in the quote submission.</p>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">12.6 Additional Settings</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
      <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Setting</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Description</th></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Require Login</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Users must be logged in to submit a quote</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Success Page URL</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Redirect URL after successful submission</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Default Country</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Pre-selected country in the address dropdown</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Show Country Field</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Toggle the country dropdown visibility</td></tr>
    </table>
  </div>
</section>

<!-- 13. EMAIL -->
<section id="email" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">13. Email Configuration</h2>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">13.1 Quote Notification Emails</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">When a quote is submitted, emails are sent to:</p>
    <ol style="padding-left: 24px; box-sizing: border-box;">
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Site Owner Email</strong> – Automatically detected from your site</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Notification Email 1</strong> – Configured in the panel</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Notification Email 2</strong> – Configured in the panel</li>
    </ol>
    <p style="margin-bottom: 8px; box-sizing: border-box;">The notification email includes all form data, a styled product table with images, quantities, prices, and a total.</p>
  </div>

  <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">13.2 Feedback Email to Customer</h3>
  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">Toggle <strong>Send Feedback Email</strong> to send a confirmation email to the customer after they submit a quote.</p>
    <p style="margin-bottom: 8px; box-sizing: border-box;">The email content is a customizable <strong>HTML template</strong> with these placeholders:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
      <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Placeholder</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Replaced With</th></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{firstName}</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Customer's first name</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{lastName}</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Customer's last name</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{email}</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Customer's email</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{phone}</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Customer's phone number</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{company}</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Company name</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{moreInfo}</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Additional info text</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{eventLocation}</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Event location</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{eventStartTime}</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Event start time</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{eventEndTime}</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Event end time</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{setupStartTime}</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Setup start time</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{setupEndTime}</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Setup end time</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{checkboxGroup1}</code> – <code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{checkboxGroup4}</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Selected checkbox options</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{fileUpload1}</code>, <code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{fileUpload2}</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Uploaded file URLs</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{products}</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Auto-generated product table (HTML)</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{total}</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Cart total</td></tr>
    </table>

    <h4 style="font-size: 1.05rem; margin: 16px 0 8px; color: #6c757d; box-sizing: border-box;">Example Template</h4>
    <pre style="background: #1e1e2e; color: #cdd6f4; padding: 20px; border-radius: 8px; overflow-x: auto; margin: 12px 0; font-size: 0.88rem; line-height: 1.6; box-sizing: border-box;">&lt;h1&gt;Thank you, {firstName}!&lt;/h1&gt;
&lt;p&gt;We've received your quote request and will get back to you shortly.&lt;/p&gt;

&lt;h2&gt;Your Requested Items&lt;/h2&gt;
{products}

&lt;p&gt;&lt;strong&gt;Total:&lt;/strong&gt; {total}&lt;/p&gt;

&lt;p&gt;If you have questions, reply to this email.&lt;/p&gt;</pre>

    <div style="padding: 16px 20px; border-radius: 8px; margin: 16px 0; font-size: 0.95rem; background: #eaf4fe; border-left: 4px solid #3498db; color: #1a5276; box-sizing: border-box;">
      <strong style="display: block; margin-bottom: 4px; box-sizing: border-box;">Tip:</strong> The <code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">{products}</code> placeholder automatically generates a styled HTML table with product images, names, quantities, and prices. You don't need to build this manually.
    </div>
  </div>
</section>

<!-- 14. STYLING -->
<section id="styling" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">14. Styling &amp; Customization</h2>
  <p style="margin-bottom: 8px; box-sizing: border-box;">Every widget has extensive styling options in its settings panel. Here's what you can customize:</p>

  <details style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 8px; margin-bottom: 8px; box-sizing: border-box;">
    <summary style="padding: 14px 20px; cursor: pointer; font-weight: 600; user-select: none; box-sizing: border-box;">Colors (60+ properties)</summary>
    <div style="padding: 0 20px 16px; box-sizing: border-box;">
      <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
        <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Category</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Properties</th></tr>
        <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Text</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Title, labels, input text, prices, product names, error, success messages</td></tr>
        <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Backgrounds</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Page, sections, cards, inputs, modals, overlays</td></tr>
        <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Borders</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Cards, forms, inputs, focus states</td></tr>
        <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Buttons</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Background, text, hover for all buttons (add to cart, request quote, checkout)</td></tr>
        <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Reviews</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Star color, card background, author text, date text</td></tr>
        <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Tabs</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Active tab, inactive tab, border</td></tr>
        <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Breadcrumbs</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Text, link, separator</td></tr>
        <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Accordion</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Button background/text/border, content background/text</td></tr>
        <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Product Options</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Dropdown background/text/border</td></tr>
      </table>
    </div>
  </details>

  <details style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 8px; margin-bottom: 8px; box-sizing: border-box;">
    <summary style="padding: 14px 20px; cursor: pointer; font-weight: 600; user-select: none; box-sizing: border-box;">Fonts (40+ properties)</summary>
    <div style="padding: 0 20px 16px; box-sizing: border-box;">
      <p style="margin-bottom: 8px; box-sizing: border-box;">Click on any font field to open the Wix font picker. Fonts you can set include:</p>
      <ul style="padding-left: 24px; box-sizing: border-box;">
        <li style="margin-bottom: 8px; box-sizing: border-box;">Product name, SKU, price, description</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Form labels, input text, button text</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Reviews title and text</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Product options labels and dropdowns</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Accordion button and content</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Breadcrumb text</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Tab labels</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Error messages</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Quote form labels and inputs</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Checkout button</li>
      </ul>
    </div>
  </details>

  <details style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 8px; margin-bottom: 8px; box-sizing: border-box;">
    <summary style="padding: 14px 20px; cursor: pointer; font-weight: 600; user-select: none; box-sizing: border-box;">Border Radius &amp; Spacing</summary>
    <div style="padding: 0 20px 16px; box-sizing: border-box;">
      <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
        <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Property</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Applies To</th></tr>
        <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Card Border Radius</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Product cards in grids and carousels</td></tr>
        <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Form Border Radius</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Quote form container</td></tr>
        <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Input Border Radius</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">All form inputs</td></tr>
        <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Button Border Radius</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Action buttons</td></tr>
        <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Checkout Button Border Radius</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Checkout/submit button</td></tr>
        <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Ribbon Border Radius</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Sale/new product ribbons</td></tr>
        <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Grid Gap</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Spacing between grid items</td></tr>
        <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Slide Gap</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Spacing between carousel slides</td></tr>
      </table>
    </div>
  </details>

  <details style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 8px; margin-bottom: 8px; box-sizing: border-box;">
    <summary style="padding: 14px 20px; cursor: pointer; font-weight: 600; user-select: none; box-sizing: border-box;">Shadows &amp; Effects</summary>
    <div style="padding: 0 20px 16px; box-sizing: border-box;">
      <ul style="padding-left: 24px; box-sizing: border-box;">
        <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Section Shadow</strong> – Toggle box shadow on cart/form sections</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Input Focus Shadow</strong> – Custom glow color on input focus</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Modal Shadow</strong> – Shadow on quick view modals</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;"><strong>Button Hover</strong> – Color changes on hover</li>
      </ul>
    </div>
  </details>
</section>

<!-- 15. LANGUAGES -->
<section id="languages" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">15. Multi-Language Support</h2>

  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <p style="margin-bottom: 8px; box-sizing: border-box;">The Cart Page widget supports <strong>5 languages</strong> for all form labels, validation messages, button text, and UI elements:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
      <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Code</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Language</th></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">en</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">English</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">es</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Spanish (Espa&ntilde;ol)</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">fr</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">French (Fran&ccedil;ais)</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">de</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">German (Deutsch)</td></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">it</code></td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Italian (Italiano)</td></tr>
    </table>
    <p style="margin-bottom: 8px; box-sizing: border-box;">Set the language from the Cart Page panel's <strong>Language</strong> dropdown. This changes all built-in labels, placeholders, validation messages, and button text automatically.</p>
  </div>
</section>

<!-- 16. CART MODES -->
<section id="cart-modes" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">16. Cart Modes: Current Cart vs Quote Cart</h2>

  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">Current Cart</h3>
    <p style="margin-bottom: 8px; box-sizing: border-box;">Displays items from the <strong>Wix Stores cart</strong>. These are items added via the standard "Add to Cart" button. Users can:</p>
    <ul style="padding-left: 24px; box-sizing: border-box;">
      <li style="margin-bottom: 8px; box-sizing: border-box;">Adjust quantities</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Remove items</li>
      <li style="margin-bottom: 8px; box-sizing: border-box;">Proceed to checkout</li>
    </ul>
  </div>

  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">Quote Cart</h3>
    <p style="margin-bottom: 8px; box-sizing: border-box;">Displays items added via the <strong>"Request Quote"</strong> button on the Product Detail Page. This is a separate cart managed by the app.</p>
    <div style="padding: 16px 20px; border-radius: 8px; margin: 16px 0; font-size: 0.95rem; background: #fdedec; border-left: 4px solid #e74c3c; color: #922b21; box-sizing: border-box;">
      <strong style="display: block; margin-bottom: 4px; box-sizing: border-box;">Requirement:</strong> The Quote Cart only works when you use the <strong>Product Detail Page widget from the Request a Quote app</strong>. Items added via Wix's default product page will NOT appear in the quote cart.
    </div>
  </div>

  <div style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 10px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); box-sizing: border-box;">
    <h3 style="font-size: 1.2rem; margin: 24px 0 10px; color: #2c3e50; box-sizing: border-box;">Configuration</h3>
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.93rem; box-sizing: border-box;">
      <tr><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Setting</th><th style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; background: #f1f3f5; font-weight: 600; box-sizing: border-box;">Behavior</th></tr>
      <tr style="background: #fafbfd; box-sizing: border-box;"><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><strong>Show Current Cart Only</strong> = Checked</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Only the Wix current cart is shown. No quote cart tab. Works with any product page.</td></tr>
      <tr><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;"><strong>Show Current Cart Only</strong> = Unchecked</td><td style="padding: 10px 14px; text-align: left; border: 1px solid #e0e4ea; box-sizing: border-box;">Both tabs appear (Current Cart + Quote Cart). <strong>Requires</strong> the app's Product Detail Page widget.</td></tr>
    </table>
  </div>
</section>

<!-- 17. TROUBLESHOOTING -->
<section id="troubleshooting" style="margin-bottom: 48px; box-sizing: border-box;">
  <h2 style="font-size: 1.6rem; color: #4361ee; border-bottom: 3px solid #4361ee; padding-bottom: 8px; margin-bottom: 20px; box-sizing: border-box;">17. Troubleshooting</h2>

  <details style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 8px; margin-bottom: 8px; box-sizing: border-box;">
    <summary style="padding: 14px 20px; cursor: pointer; font-weight: 600; user-select: none; box-sizing: border-box;">Product page shows "No products found" error</summary>
    <div style="padding: 0 20px 16px; box-sizing: border-box;">
      <ul style="padding-left: 24px; box-sizing: border-box;">
        <li style="margin-bottom: 8px; box-sizing: border-box;">Make sure you have at least one product in your Wix Store.</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">If using the widget in the editor/preview, it loads the first product automatically. On a live site, the product is determined by the URL slug.</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Check that your product URL follows the pattern: <code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">/product-page/your-product-slug</code></li>
      </ul>
    </div>
  </details>

  <details style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 8px; margin-bottom: 8px; box-sizing: border-box;">
    <summary style="padding: 14px 20px; cursor: pointer; font-weight: 600; user-select: none; box-sizing: border-box;">Product with special characters in slug not loading</summary>
    <div style="padding: 0 20px 16px; box-sizing: border-box;">
      <p style="margin-bottom: 8px; box-sizing: border-box;">Slugs with accented characters (e.g., <code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">&eacute;</code>, <code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">&iacute;</code>, <code style="background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, monospace; box-sizing: border-box;">&oacute;</code>) are automatically decoded from URL encoding. If a product still doesn't load:</p>
      <ul style="padding-left: 24px; box-sizing: border-box;">
        <li style="margin-bottom: 8px; box-sizing: border-box;">Verify the slug in your Wix Store's product settings matches exactly.</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Check the browser console or Wix site logs for error details.</li>
      </ul>
    </div>
  </details>

  <details style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 8px; margin-bottom: 8px; box-sizing: border-box;">
    <summary style="padding: 14px 20px; cursor: pointer; font-weight: 600; user-select: none; box-sizing: border-box;">Images not showing on the product page</summary>
    <div style="padding: 0 20px 16px; box-sizing: border-box;">
      <ul style="padding-left: 24px; box-sizing: border-box;">
        <li style="margin-bottom: 8px; box-sizing: border-box;">If images show as broken, check that the product has media items in the Wix Store.</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Ensure the widget is using the latest version of the app.</li>
      </ul>
    </div>
  </details>

  <details style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 8px; margin-bottom: 8px; box-sizing: border-box;">
    <summary style="padding: 14px 20px; cursor: pointer; font-weight: 600; user-select: none; box-sizing: border-box;">Quote form emails not being received</summary>
    <div style="padding: 0 20px 16px; box-sizing: border-box;">
      <ul style="padding-left: 24px; box-sizing: border-box;">
        <li style="margin-bottom: 8px; box-sizing: border-box;">Check that <strong>Notification Email 1</strong> or <strong>Notification Email 2</strong> is set in the panel.</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Check your spam/junk folder.</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Verify the email addresses are spelled correctly.</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Check the browser console or Wix site logs for errors.</li>
      </ul>
    </div>
  </details>

  <details style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 8px; margin-bottom: 8px; box-sizing: border-box;">
    <summary style="padding: 14px 20px; cursor: pointer; font-weight: 600; user-select: none; box-sizing: border-box;">Font picker not opening when clicked</summary>
    <div style="padding: 0 20px 16px; box-sizing: border-box;">
      <p style="margin-bottom: 8px; box-sizing: border-box;">If clicking a font selector in the panel does nothing, make sure you're in the Wix Editor (not preview mode). The font picker is provided by the Wix Editor SDK and only works in the editor environment.</p>
    </div>
  </details>

  <details style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 8px; margin-bottom: 8px; box-sizing: border-box;">
    <summary style="padding: 14px 20px; cursor: pointer; font-weight: 600; user-select: none; box-sizing: border-box;">Quote cart is empty even after adding items</summary>
    <div style="padding: 0 20px 16px; box-sizing: border-box;">
      <ul style="padding-left: 24px; box-sizing: border-box;">
        <li style="margin-bottom: 8px; box-sizing: border-box;">The quote cart only collects items added via the <strong>Request Quote</strong> button on the app's Product Detail Page widget.</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Items added via Wix's default "Add to Cart" go to the Wix current cart, not the quote cart.</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Make sure "Show Current Cart Only" is <strong>unchecked</strong> on the Cart Page panel to see the quote cart tab.</li>
      </ul>
    </div>
  </details>

  <details style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 8px; margin-bottom: 8px; box-sizing: border-box;">
    <summary style="padding: 14px 20px; cursor: pointer; font-weight: 600; user-select: none; box-sizing: border-box;">Product shows "Out of Stock" incorrectly</summary>
    <div style="padding: 0 20px 16px; box-sizing: border-box;">
      <ul style="padding-left: 24px; box-sizing: border-box;">
        <li style="margin-bottom: 8px; box-sizing: border-box;">Check the product's stock settings in Wix Store.</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">If the product has variants, stock status may be per-variant. Select the correct variant options.</li>
      </ul>
    </div>
  </details>

  <details style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 8px; margin-bottom: 8px; box-sizing: border-box;">
    <summary style="padding: 14px 20px; cursor: pointer; font-weight: 600; user-select: none; box-sizing: border-box;">Address dropdowns not loading countries/states/cities</summary>
    <div style="padding: 0 20px 16px; box-sizing: border-box;">
      <ul style="padding-left: 24px; box-sizing: border-box;">
        <li style="margin-bottom: 8px; box-sizing: border-box;">Address dropdowns are populated dynamically. If they don't load, the service may be temporarily unavailable.</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Check your internet connection and try refreshing the page.</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Ensure "Show Address Fields" is enabled in the panel.</li>
      </ul>
    </div>
  </details>

  <details style="background: #ffffff; border: 1px solid #e0e4ea; border-radius: 8px; margin-bottom: 8px; box-sizing: border-box;">
    <summary style="padding: 14px 20px; cursor: pointer; font-weight: 600; user-select: none; box-sizing: border-box;">Price showing a loading skeleton forever</summary>
    <div style="padding: 0 20px 16px; box-sizing: border-box;">
      <p style="margin-bottom: 8px; box-sizing: border-box;">The price section shows a brief loading indicator while quote settings are checked from the <a href="#manage-products" style="color: #4361ee; text-decoration: none; font-weight: 500; box-sizing: border-box;">Manage Products dashboard</a>. If it stays in loading state:</p>
      <ul style="padding-left: 24px; box-sizing: border-box;">
        <li style="margin-bottom: 8px; box-sizing: border-box;">Verify you have configured quote settings via <strong>Request a Quote &rarr; Manage Products</strong> in the dashboard.</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Try refreshing the page or clearing the browser cache.</li>
        <li style="margin-bottom: 8px; box-sizing: border-box;">Contact support if the issue persists.</li>
      </ul>
    </div>
  </details>
</section>

</div>

<footer style="text-align: center; padding: 40px 20px; color: #6c757d; font-size: 0.9rem; border-top: 1px solid #e0e4ea; margin-top: 40px; box-sizing: border-box;">
  <p style="margin-bottom: 8px; box-sizing: border-box;"><strong>Request a Quote App</strong> &mdash; Setup Guide</p>
  <p style="margin-bottom: 8px; box-sizing: border-box;">For support, contact the app developer.</p>
</footer>

</body>
</html>  
  `

    const emailPayload = { emailTemplate };

    sendEmail(email, "Welcome to Request a Quote – Setup Guide", emailPayload);
    sendEmail("devsusan24@gmail.com", "New Request a Quote Installation", { email, site, app, instanceId });

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
      await saveAppInstanceToAPI(apiData);
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
      await saveAppInstanceToAPI(paidPlanData);
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
    await saveAppInstanceToAPI(cancellationData);
    const res = await saveAppInstanceToGoogleSheets(cancellationData);
    console.log({ res, cancellationData });
  } catch (error) {
    console.error('Cancellation save error:', error);
  }

  console.log("=== AUTO RENEWAL CANCELLATION EVENT COMPLETE ===\n");
});

client.appInstances.onAppInstancePlanConvertedToPaid(async (event) => {
  console.log(`onAppInstancePlanConvertedToPaid invoked with data: `, event);
  console.log(`App instance ID: `, event.metadata.instanceId);

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
      await saveAppInstanceToAPI(paidPlanData);
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

const handleQuotes = async (req, res) => {


  try {
    console.log("🔄 Processing webhook with Wix client...");
    await client.webhooks.process(req.body);
    console.log("✅ Webhook processed successfully");

    console.log("📤 Sending success response (200)");
    res.status(200).send();
  } catch (err) {
    const errorMessage = `Webhook error: ${err instanceof Error ? err.message : err} `;
    res.status(500).send(errorMessage);
    return;
  }

  console.log("=== WEBHOOK REQUEST COMPLETE ===\n");
};

module.exports = { handleQuotes };
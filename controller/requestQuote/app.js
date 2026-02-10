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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #4361ee;
      --primary-dark: #3a56d4;
      --accent: #f72585;
      --bg: #f8f9fc;
      --card: #ffffff;
      --text: #2c3e50;
      --text-light: #6c757d;
      --border: #e0e4ea;
      --code-bg: #f1f3f5;
      --success: #2ecc71;
      --warning: #f39c12;
      --danger: #e74c3c;
      --info: #3498db;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      color: var(--text);
      background: var(--bg);
      line-height: 1.7;
    }

    /* Header */
    .hero {
      background: linear-gradient(135deg, var(--primary) 0%, #7209b7 100%);
      color: #fff;
      padding: 60px 20px;
      text-align: center;
    }
    .hero h1 { font-size: 2.5rem; margin-bottom: 12px; }
    .hero p { font-size: 1.15rem; opacity: 0.9; max-width: 640px; margin: 0 auto; }

    /* Layout */f
    .container { max-width: 960px; margin: 0 auto; padding: 0 24px; }

    /* Table of Contents */
    .toc {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px;
      margin: -40px auto 40px;
      position: relative;
      z-index: 1;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    }
    .toc h2 { font-size: 1.3rem; margin-bottom: 16px; color: var(--primary); }
    .toc ol { padding-left: 20px; }
    .toc li { margin-bottom: 6px; }
    .toc a { color: var(--primary); text-decoration: none; font-weight: 500; }
    .toc a:hover { text-decoration: underline; }

    /* Sections */
    section { margin-bottom: 48px; }
    section > h2 {
      font-size: 1.6rem;
      color: var(--primary);
      border-bottom: 3px solid var(--primary);
      padding-bottom: 8px;
      margin-bottom: 20px;
    }
    h3 {
      font-size: 1.2rem;
      margin: 24px 0 10px;
      color: var(--text);
    }
    h4 {
      font-size: 1.05rem;
      margin: 16px 0 8px;
      color: var(--text-light);
    }
    p, li { margin-bottom: 8px; }
    ul, ol { padding-left: 24px; }

    /* Cards */
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }
    .card h3 { margin-top: 0; }

    /* Step cards */
    .step {
      display: flex;
      gap: 20px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 24px;
      margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }
    .step-number {
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      background: var(--primary);
      color: #fff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.1rem;
    }
    .step-content { flex: 1; }
    .step-content h4 { margin-top: 0; color: var(--text); font-size: 1.1rem; }

    /* Alerts */
    .alert {
      padding: 16px 20px;
      border-radius: 8px;
      margin: 16px 0;
      font-size: 0.95rem;
    }
    .alert-info { background: #eaf4fe; border-left: 4px solid var(--info); color: #1a5276; }
    .alert-warning { background: #fef9e7; border-left: 4px solid var(--warning); color: #7d6608; }
    .alert-success { background: #eafaf1; border-left: 4px solid var(--success); color: #1e8449; }
    .alert-danger { background: #fdedec; border-left: 4px solid var(--danger); color: #922b21; }
    .alert strong { display: block; margin-bottom: 4px; }

    /* Code */
    code {
      background: var(--code-bg);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
      font-family: 'SFMono-Regular', Consolas, monospace;
    }
    pre {
      background: #1e1e2e;
      color: #cdd6f4;
      padding: 20px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 12px 0;
      font-size: 0.88rem;
      line-height: 1.6;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 0.93rem;
    }
    th, td {
      padding: 10px 14px;
      text-align: left;
      border: 1px solid var(--border);
    }
    th { background: var(--code-bg); font-weight: 600; }
    tr:nth-child(even) { background: #fafbfd; }

    /* Badge */
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 20px;
      font-size: 0.78rem;
      font-weight: 600;
      vertical-align: middle;
    }
    .badge-required { background: #fdedec; color: var(--danger); }
    .badge-optional { background: #eafaf1; color: var(--success); }
    .badge-new { background: #eaf4fe; color: var(--info); }

    /* Widget grid */
    .widget-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      margin: 16px 0;
    }
    .widget-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px;
      transition: box-shadow 0.2s;
    }
    .widget-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
    .widget-card h4 { margin-top: 0; color: var(--primary); }
    .widget-card p { font-size: 0.92rem; color: var(--text-light); margin: 0; }

    /* Accordion */
    details {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 8px;
    }
    details[open] { border-color: var(--primary); }
    summary {
      padding: 14px 20px;
      cursor: pointer;
      font-weight: 600;
      user-select: none;
    }
    summary:hover { background: #f5f7ff; border-radius: 8px; }
    details .inner { padding: 0 20px 16px; }

    /* Footer */
    footer {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-light);
      font-size: 0.9rem;
      border-top: 1px solid var(--border);
      margin-top: 40px;
    }

    @media (max-width: 600px) {
      .hero h1 { font-size: 1.8rem; }
      .step { flex-direction: column; gap: 12px; }
      .widget-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>

<!-- HERO -->
<header class="hero">
  <h1>Request a Quote App</h1>
  <p>Complete setup guide for installing, configuring, and using the Request a Quote Wix app with all its widgets and features.</p>
  <a href="https://meetings-na2.hubspot.com/joey-digangi1/wix-app-demo" style="display: inline-block; margin-top: 24px; padding: 16px 40px; background: #fff; color: #7209b7; font-weight: 700; font-size: 1.15rem; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); transition: transform 0.2s;">Book a Free Live Demo</a>
</header>

<div class="container">

<!-- TABLE OF CONTENTS -->
<nav class="toc">
  <h2>Table of Contents</h2>
  <ol>
    <li><a href="#overview">App Overview &amp; Widgets</a></li>
    <li><a href="#installation">Installation &amp; First Setup</a></li>
    <li><a href="#manage-products">Manage Products – Quote Settings Dashboard</a></li>
    <li><a href="#pdp">Setting Up the Product Detail Page</a></li>
    <li><a href="#cart">Setting Up the Cart Page</a></li>
    <li><a href="#grid">Setting Up the Product Grid</a></li>
    <li><a href="#slider">Setting Up the Slider Gallery</a></li>
    <li><a href="#related">Setting Up Related Products</a></li>
    <li><a href="#categories">Setting Up the Categories Page</a></li>
    <li><a href="#search">Setting Up the Search Page</a></li>
    <li><a href="#top-products">Setting Up Top Products</a></li>
    <li><a href="#quote-form">Quote Form Fields Reference</a></li>
    <li><a href="#email">Email Configuration</a></li>
    <li><a href="#styling">Styling &amp; Customization</a></li>
    <li><a href="#languages">Multi-Language Support</a></li>
    <li><a href="#cart-modes">Cart Modes: Current Cart vs Quote Cart</a></li>
    <li><a href="#troubleshooting">Troubleshooting</a></li>
  </ol>
</nav>

<!-- 1. OVERVIEW -->
<section id="overview">
  <h2>1. App Overview &amp; Widgets</h2>
  <p>The Request a Quote app is a comprehensive Wix e-commerce solution that adds quote request functionality to your online store. It includes <strong>8 widgets</strong> that you can place on any page of your site.</p>

  <div class="widget-grid">
    <div class="widget-card">
      <h4>Product Detail Page</h4>
      <p>Full product page with gallery, options, variants, reviews, and quote request form.</p>
    </div>
    <div class="widget-card">
      <h4>Cart Page</h4>
      <p>Cart display with quote form submission, contact info collection, and email notifications.</p>
    </div>
    <div class="widget-card">
      <h4>Product Grid</h4>
      <p>Browse products in a filterable, paginated grid layout with quick view.</p>
    </div>
    <div class="widget-card">
      <h4>Slider Gallery</h4>
      <p>Auto-playing product carousel with navigation arrows and dots.</p>
    </div>
    <div class="widget-card">
      <h4>Related Products</h4>
      <p>Display products from the same collection as the current product.</p>
    </div>
    <div class="widget-card">
      <h4>Categories Page</h4>
      <p>Display all product categories in a browsable grid.</p>
    </div>
    <div class="widget-card">
      <h4>Search Page</h4>
      <p>Full-text product search with filtering and quick view.</p>
    </div>
    <div class="widget-card">
      <h4>Top Products</h4>
      <p>Showcase selected featured products in a carousel.</p>
    </div>
  </div>
</section>

<!-- 2. INSTALLATION -->
<section id="installation">
  <h2>2. Installation &amp; First Setup</h2>

  <div class="step">
    <div class="step-number">1</div>
    <div class="step-content">
      <h4>Install the App</h4>
      <p>Install the <strong>Request a Quote</strong> app from the Wix App Market. Once installed, the widgets become available in the Wix Editor under <strong>Add &rarr; App Widgets</strong>.</p>
    </div>
  </div>

  <div class="step">
    <div class="step-number">2</div>
    <div class="step-content">
      <h4>Add Your Products</h4>
      <p>Make sure you have products in your Wix Store. The app reads products directly from your store's catalog automatically.</p>
    </div>
  </div>

  <div class="step">
    <div class="step-number">3</div>
    <div class="step-content">
      <h4>Configure Quote Settings per Product</h4>
      <p>Go to the <strong>Request a Quote &rarr; Manage Products</strong> page in your Wix Dashboard. Here you can toggle <strong>QUOTE ONLY</strong> for each product. When enabled, the product's price is hidden and only the "Request Quote" button is shown. See <a href="#manage-products">Section 3: Manage Products Dashboard</a> for full details.</p>
    </div>
  </div>

  <div class="step">
    <div class="step-number">4</div>
    <div class="step-content">
      <h4>Add a Product Detail Page Widget</h4>
      <p>Drag the <strong>Product Detail Page</strong> widget onto a page. This is the core widget that displays individual products and handles quote requests. It will automatically load the first product in your store when in the editor.</p>
    </div>
  </div>

  <div class="step">
    <div class="step-number">5</div>
    <div class="step-content">
      <h4>Add a Cart Page Widget</h4>
      <p>Drag the <strong>Cart Page</strong> widget onto a separate page. This is where users review their quote items and submit the quote form. This widget collects all the contact info, address, and additional fields you configure.</p>
    </div>
  </div>

  <div class="step">
    <div class="step-number">6</div>
    <div class="step-content">
      <h4>Configure Email Recipients</h4>
      <p>Open the settings panel of both the Product Detail Page and Cart Page widgets. Set your <strong>notification email addresses</strong> so you receive quote submissions. You can set up to 2 notification emails per widget.</p>
    </div>
  </div>

  <div class="step">
    <div class="step-number">7</div>
    <div class="step-content">
      <h4>Browse &amp; Display Widgets (Optional)</h4>
      <p>Add the <strong>Product Grid</strong>, <strong>Slider Gallery</strong>, <strong>Categories</strong>, or <strong>Search</strong> widgets to help users browse your products. These all link to the Product Detail Page for individual product views.</p>
    </div>
  </div>

  <div class="alert alert-warning">
    <strong>Important: URL Routing</strong>
    The Product Detail Page uses URL slugs to determine which product to display on live sites. Products are accessible via <code>/product-page/your-product-slug</code> or <code>/products/your-product-slug</code>.
  </div>
</section>

<!-- 3. MANAGE PRODUCTS DASHBOARD -->
<section id="manage-products">
  <h2>3. Manage Products – Quote Settings Dashboard</h2>
  <p>The <strong>Manage Products</strong> page is a dashboard page within the Request a Quote app where you control quote behavior for each product individually.</p>

  <h3>3.1 Accessing the Dashboard</h3>
  <div class="card">
    <p>Navigate to your Wix Dashboard and find <strong>Request a Quote &rarr; Manage Products</strong> in the left sidebar. This opens the Product Management page.</p>
  </div>

  <h3>3.2 The Product Management Table</h3>
  <div class="card">
    <p>The dashboard displays a table listing all products from your Wix Store with the following columns:</p>
    <table>
      <tr><th>Column</th><th>Description</th></tr>
      <tr><td>Product Name</td><td>The name of the product as it appears in your store</td></tr>
      <tr><td>Price</td><td>The product's listed price</td></tr>
      <tr><td>SKU</td><td>The product's SKU code</td></tr>
      <tr><td>QUOTE ONLY</td><td>A checkbox toggle to mark the product as quote-only</td></tr>
    </table>
  </div>

  <h3>3.3 The QUOTE ONLY Toggle</h3>
  <div class="card">
    <p>Checking the <strong>QUOTE ONLY</strong> checkbox for a product changes its behavior on the Product Detail Page:</p>
    <ul>
      <li><strong>Price is hidden</strong> – The product price section is not displayed to visitors</li>
      <li><strong>"Request Quote" becomes the primary action</strong> – Instead of showing a price and add-to-cart, the product directs users to request a quote</li>
      <li><strong>Cart behavior adapts</strong> – Quote-only products guide users through the quote form flow rather than the standard checkout</li>
    </ul>

    <div class="alert alert-info">
      <strong>How it works:</strong> When the Product Detail Page loads, it checks the quote settings for the current product. If the product is marked as QUOTE ONLY, the price section is hidden automatically. Products that are <em>not</em> marked as QUOTE ONLY display their price normally.
    </div>

    <div class="alert alert-warning">
      <strong>Tip:</strong> Use QUOTE ONLY for products where pricing depends on configuration, quantity, or custom requirements – for example, bulk orders, custom-built items, or rental equipment where the final price needs a personalized quote.
    </div>
  </div>

  <h3>3.4 Example Workflow</h3>
  <div class="card">
    <ol>
      <li>Go to <strong>Request a Quote &rarr; Manage Products</strong> in your Wix Dashboard</li>
      <li>Find the product you want to make quote-only</li>
      <li>Check the <strong>QUOTE ONLY</strong> checkbox in that product's row</li>
      <li>The setting is saved automatically</li>
      <li>On the live site, that product's price is now hidden and visitors are prompted to request a quote instead</li>
    </ol>
  </div>
</section>

<!-- 4. PRODUCT DETAIL PAGE -->
<section id="pdp">
  <h2>4. Setting Up the Product Detail Page</h2>
  <p>Click on the Product Detail Page widget in the Wix Editor and open its <strong>Settings Panel</strong>. The panel is organized into accordion sections.</p>

  <h3>4.1 Product Information</h3>
  <div class="card">
    <p>Control which product details are visible:</p>
    <table>
      <tr><th>Toggle</th><th>Description</th><th>Default</th></tr>
      <tr><td>Show Product Name</td><td>Display the product title</td><td>On</td></tr>
      <tr><td>Show SKU</td><td>Display the product SKU code</td><td>On</td></tr>
      <tr><td>Show Price</td><td>Display product pricing (sale/regular). Note: products marked as <strong>QUOTE ONLY</strong> in the <a href="#manage-products">Manage Products dashboard</a> will have their price hidden automatically regardless of this setting.</td><td>On</td></tr>
      <tr><td>Show Price Per Unit</td><td>Display per-unit pricing</td><td>Off</td></tr>
      <tr><td>Show Description</td><td>Display the product description (HTML supported)</td><td>On</td></tr>
      <tr><td>Show Product Options</td><td>Display option dropdowns (size, color, etc.)</td><td>On</td></tr>
      <tr><td>Show Custom Text Fields</td><td>Allow custom text input from users</td><td>On</td></tr>
      <tr><td>Show Quantity Selector</td><td>Allow users to choose quantity</td><td>On</td></tr>
      <tr><td>Show Stock Badge</td><td>In Stock / Out of Stock indicator</td><td>On</td></tr>
      <tr><td>Show Thumbnails</td><td>Show image thumbnail gallery</td><td>On</td></tr>
      <tr><td>Show Additional Info</td><td>Accordion sections (specs, details, etc.)</td><td>On</td></tr>
    </table>
  </div>

  <h3>4.2 Product Options &amp; Variants</h3>
  <div class="card">
    <p>Products with options (e.g., Color, Size) display dropdown selectors. When a user selects options:</p>
    <ul>
      <li>The matching <strong>variant</strong> is automatically selected</li>
      <li>Price updates to the variant price (if different)</li>
      <li>SKU updates to the variant SKU</li>
      <li>Stock status updates per variant</li>
      <li>Gallery image changes to the variant's linked media (for color options)</li>
    </ul>
  </div>

  <h3>4.3 Buttons &amp; Actions</h3>
  <div class="card">
    <table>
      <tr><th>Toggle</th><th>Description</th></tr>
      <tr><td>Show Add to Cart</td><td>Standard add-to-cart button (uses Wix cart)</td></tr>
      <tr><td>Show Request Quote</td><td>Opens the quote form for this product</td></tr>
      <tr><td>Show Wishlist Button</td><td>Heart icon for wishlist</td></tr>
      <tr><td>Show Share Button</td><td>Share product link</td></tr>
    </table>
    <p>You can customize the <strong>Add to Cart label</strong> and <strong>Request Quote label</strong> text.</p>
  </div>

  <h3>4.4 Reviews Section</h3>
  <div class="card">
    <p>Toggle <strong>Show Reviews</strong> to display product reviews from the Wix Reviews app. Reviews display:</p>
    <ul>
      <li>Star rating</li>
      <li>Review text</li>
      <li>Author name and date</li>
      <li>Custom styling (card background, text colors, star color, fonts)</li>
    </ul>
  </div>

  <h3>4.5 Quote Review Section</h3>
  <div class="card">
    <p>The <strong>Quote Review</strong> tab shows products the user has added to their quote. Toggle what info appears:</p>
    <ul>
      <li>Show/hide product name</li>
      <li>Show/hide SKU</li>
      <li>Show/hide quantity</li>
      <li>Show/hide selected variant</li>
      <li>Show/hide selected options</li>
    </ul>
  </div>

  <h3>4.6 Breadcrumbs</h3>
  <div class="card">
    <p>Enable breadcrumb navigation above the product with customizable:</p>
    <ul>
      <li><strong>Home Text</strong> – Label for the home link (default: "Home")</li>
      <li><strong>Category Text</strong> – Label for the category breadcrumb</li>
      <li><strong>Colors</strong> – Current page text, link, and separator colors</li>
      <li><strong>Font</strong> – Breadcrumb font family</li>
    </ul>
  </div>

  <h3>4.7 Quote Form on Product Page</h3>
  <div class="card">
    <p>When a user clicks <strong>Request Quote</strong>, a form is shown. This form collects the same fields as the Cart Page form. See <a href="#quote-form">Section 12: Quote Form Fields Reference</a> for the full list.</p>
    <div class="alert alert-info">
      <strong>Tip:</strong> Configure the form fields, email recipients, and success page URL from the Product Detail Page panel under the quote-related sections.
    </div>
  </div>
</section>

<!-- 5. CART PAGE -->
<section id="cart">
  <h2>5. Setting Up the Cart Page</h2>
  <p>The Cart Page displays items and collects the full quote form. Click the widget and open its settings panel.</p>

  <h3>5.1 General Settings</h3>
  <div class="card">
    <table>
      <tr><th>Setting</th><th>Description</th></tr>
      <tr><td>Display Name</td><td>Title shown at the top of the cart page</td></tr>
      <tr><td>Language</td><td>Form language: English, Spanish, French, German, or Italian</td></tr>
      <tr><td>Show Price</td><td>Toggle product prices in cart items</td></tr>
      <tr><td>Show Item Description</td><td>Toggle item description below product name</td></tr>
      <tr><td>Show Current Cart Only</td><td>When checked, only shows the Wix current cart (no quote cart tab)</td></tr>
    </table>

    <div class="alert alert-warning">
      <strong>Show Current Cart Only:</strong> If you uncheck this, you need to use the custom Product Detail Page widget from the Request a Quote app. The quote cart only works with items added through the app's "Request Quote" button.
    </div>
  </div>

  <h3>5.2 Email Configuration</h3>
  <div class="card">
    <table>
      <tr><th>Setting</th><th>Description</th></tr>
      <tr><td>Notification Email 1</td><td>Primary email to receive quote submissions</td></tr>
      <tr><td>Notification Email 2</td><td>Secondary email recipient</td></tr>
      <tr><td>License Email</td><td>Email tied to your license/account</td></tr>
      <tr><td>Send Feedback Email</td><td>Toggle confirmation email to the customer</td></tr>
      <tr><td>Feedback Email Content</td><td>HTML template for the customer email</td></tr>
    </table>
    <p>See <a href="#email">Section 13: Email Configuration</a> for template placeholders and details.</p>
  </div>

  <h3>5.3 Form Fields Configuration</h3>
  <div class="card">
    <p>The Cart Page panel lets you toggle visibility and required status for every form field. You can also customize labels and reorder fields with drag-and-drop. See <a href="#quote-form">Section 12: Quote Form Fields Reference</a> for the complete list.</p>
  </div>

  <h3>5.4 Form Field Order</h3>
  <div class="card">
    <p>Drag and drop fields to reorder how they appear on the form. The order is saved automatically. Default order:</p>
    <p>Default order: First Name, Last Name, Email, Phone, Company, Address, Additional Info, Event Location, Event Start Time, Event End Time, Setup Start Time, Setup End Time, Checkbox Group 1–4, File Upload 1–2.</p>
  </div>
</section>

<!-- 6. PRODUCT GRID -->
<section id="grid">
  <h2>6. Setting Up the Product Grid</h2>

  <div class="card">
    <h3>Layout Settings</h3>
    <table>
      <tr><th>Setting</th><th>Description</th><th>Default</th></tr>
      <tr><td>Items Per Page</td><td>Number of products per page</td><td>12</td></tr>
      <tr><td>Columns</td><td>Number of columns in the grid</td><td>3</td></tr>
      <tr><td>Grid Gap</td><td>Spacing between product cards (px)</td><td>20</td></tr>
      <tr><td>Card Border Radius</td><td>Rounded corners on cards (px)</td><td>8</td></tr>
      <tr><td>Ribbon Border Radius</td><td>Rounded corners on sale/new ribbons</td><td>4</td></tr>
    </table>
  </div>

  <div class="card">
    <h3>Features</h3>
    <ul>
      <li><strong>Search</strong> – Toggle a search bar above the grid</li>
      <li><strong>Pagination</strong> – Navigate between pages of products</li>
      <li><strong>Quick View</strong> – Click a product to see details in a modal overlay</li>
      <li><strong>Collection Filtering</strong> – Display products from a specific collection</li>
    </ul>
  </div>
</section>

<!-- 7. SLIDER GALLERY -->
<section id="slider">
  <h2>7. Setting Up the Slider Gallery</h2>

  <div class="card">
    <h3>Carousel Settings</h3>
    <table>
      <tr><th>Setting</th><th>Description</th><th>Default</th></tr>
      <tr><td>Auto-Play</td><td>Automatically advance slides</td><td>On</td></tr>
      <tr><td>Auto-Play Interval</td><td>Time between slides (ms)</td><td>3000</td></tr>
      <tr><td>Show Arrows</td><td>Display navigation arrows</td><td>On</td></tr>
      <tr><td>Show Dots</td><td>Display dot indicators</td><td>On</td></tr>
      <tr><td>Slide Gap</td><td>Space between slides (px)</td><td>16</td></tr>
    </table>
  </div>

  <div class="card">
    <h3>Styling</h3>
    <p>Customize arrows (background, color, hover), dots (color, active color), card styling (background, border, text colors), and product info fonts. The slider also supports a quick view modal.</p>
  </div>
</section>

<!-- 8. RELATED PRODUCTS -->
<section id="related">
  <h2>8. Setting Up Related Products</h2>

  <div class="card">
    <p>The Related Products widget automatically displays products from the same collection as the current product on the Product Detail Page.</p>
    <ul>
      <li>Same carousel configuration as the Slider Gallery</li>
      <li>Quick view modal with product options and add-to-cart</li>
      <li>Automatic collection detection</li>
    </ul>
    <div class="alert alert-info">
      <strong>Tip:</strong> Place this widget below the Product Detail Page widget on the same page for the best user experience.
    </div>
  </div>
</section>

<!-- 9. CATEGORIES -->
<section id="categories">
  <h2>9. Setting Up the Categories Page</h2>

  <div class="card">
    <p>Displays all product categories from your Wix Store as a browsable grid. Users can click a category to see products within it.</p>
    <ul>
      <li>Automatic category listing from your store</li>
      <li>Products per category display</li>
      <li>Quick view modal integration</li>
      <li>Pagination support</li>
      <li>Fully styleable cards and layout</li>
    </ul>
  </div>
</section>

<!-- 10. SEARCH -->
<section id="search">
  <h2>10. Setting Up the Search Page</h2>

  <div class="card">
    <p>Provides a dedicated search experience for your products.</p>
    <ul>
      <li>Full-text search across product names and descriptions</li>
      <li>Customizable search bar placeholder text</li>
      <li>Empty state messaging when no results found</li>
      <li>Quick view modal from search results</li>
      <li>Grid layout for results</li>
    </ul>
  </div>
</section>

<!-- 11. TOP PRODUCTS -->
<section id="top-products">
  <h2>11. Setting Up Top Products</h2>

  <div class="card">
    <p>Showcase hand-picked featured products in a carousel.</p>
    <ul>
      <li><strong>Selected Product IDs</strong> – Choose which products to feature</li>
      <li><strong>Max Products</strong> – Limit the number of displayed products</li>
      <li><strong>Title</strong> – Customizable section title</li>
      <li>Same carousel controls as the Slider Gallery (auto-play, arrows, dots)</li>
      <li>Quick view modal and add-to-cart support</li>
    </ul>
  </div>
</section>

<!-- 12. QUOTE FORM FIELDS -->
<section id="quote-form">
  <h2>12. Quote Form Fields Reference</h2>
  <p>The quote form is available on both the Product Detail Page and the Cart Page. All fields can be toggled visible/hidden and required/optional from the panel.</p>

  <h3>12.1 Contact Information <span class="badge badge-required">Required</span></h3>
  <div class="card">
    <table>
      <tr><th>Field</th><th>Type</th><th>Notes</th></tr>
      <tr><td>First Name</td><td>Text</td><td>Always required, min 2 characters</td></tr>
      <tr><td>Last Name</td><td>Text</td><td>Always required, min 2 characters</td></tr>
      <tr><td>Email</td><td>Email</td><td>Always required, validated format</td></tr>
      <tr><td>Phone</td><td>Phone</td><td>Always required, custom placeholder supported</td></tr>
    </table>
  </div>

  <h3>12.2 Address Fields <span class="badge badge-optional">Optional</span></h3>
  <div class="card">
    <p>Toggle <strong>Show Address Fields</strong> in the panel to enable. When enabled, these fields appear:</p>
    <table>
      <tr><th>Field</th><th>Type</th><th>Notes</th></tr>
      <tr><td>Country</td><td>Dropdown</td><td>Populated automatically. Set a default country in the panel.</td></tr>
      <tr><td>State / Province</td><td>Dropdown</td><td>Cascading: depends on selected country</td></tr>
      <tr><td>City</td><td>Dropdown</td><td>Cascading: depends on selected state</td></tr>
      <tr><td>Address Line</td><td>Text</td><td>Street address</td></tr>
      <tr><td>Postal Code</td><td>Text</td><td>ZIP / Postal code</td></tr>
    </table>
    <p><strong>Shipping Address:</strong> If enabled, a "Different shipping address" checkbox appears. When unchecked, a second set of address fields is shown for the shipping address.</p>
  </div>

  <h3>12.3 Optional Fields</h3>
  <div class="card">
    <table>
      <tr><th>Field</th><th>Type</th><th>Toggle</th></tr>
      <tr><td>Company</td><td>Text</td><td>Show/hide + make required</td></tr>
      <tr><td>Additional Info (More Info)</td><td>Text Area</td><td>Show/hide + make required</td></tr>
      <tr><td>Event Location</td><td>Text</td><td>Show/hide + make required</td></tr>
      <tr><td>Event Start Time</td><td>Date/Time</td><td>Show/hide + make required</td></tr>
      <tr><td>Event End Time</td><td>Date/Time</td><td>Show/hide + make required</td></tr>
      <tr><td>Setup Start Time</td><td>Date/Time</td><td>Show/hide + make required</td></tr>
      <tr><td>Setup End Time</td><td>Date/Time</td><td>Show/hide + make required</td></tr>
    </table>
  </div>

  <h3>12.4 Checkbox Groups (1–4)</h3>
  <div class="card">
    <p>Up to <strong>4 checkbox groups</strong> can be configured. Each group has:</p>
    <ul>
      <li><strong>Label</strong> – Custom heading for the group</li>
      <li><strong>Options</strong> – Comma-separated list or JSON array of choices</li>
      <li><strong>Visibility</strong> – Show or hide the group</li>
      <li><strong>Required</strong> – Make at least one selection required</li>
    </ul>
    <p>Example options formats:</p>
    <pre>Option A, Option B, Option C</pre>
    <pre>["Option A", "Option B", "Option C"]</pre>
    <p>Users can select multiple checkboxes per group. Selections are included in the quote email.</p>
  </div>

  <h3>12.5 File Uploads (1–2)</h3>
  <div class="card">
    <p>Two file upload fields are available. Each has:</p>
    <ul>
      <li><strong>Visibility</strong> – Show or hide</li>
      <li><strong>Required</strong> – Make upload mandatory</li>
      <li><strong>Custom Label</strong> – Field label text</li>
      <li><strong>Max Size</strong> – 10MB per file</li>
    </ul>
    <p>Uploaded files are included in the quote submission.</p>
  </div>

  <h3>12.6 Additional Settings</h3>
  <div class="card">
    <table>
      <tr><th>Setting</th><th>Description</th></tr>
      <tr><td>Require Login</td><td>Users must be logged in to submit a quote</td></tr>
      <tr><td>Success Page URL</td><td>Redirect URL after successful submission</td></tr>
      <tr><td>Default Country</td><td>Pre-selected country in the address dropdown</td></tr>
      <tr><td>Show Country Field</td><td>Toggle the country dropdown visibility</td></tr>
    </table>
  </div>
</section>

<!-- 13. EMAIL -->
<section id="email">
  <h2>13. Email Configuration</h2>

  <h3>13.1 Quote Notification Emails</h3>
  <div class="card">
    <p>When a quote is submitted, emails are sent to:</p>
    <ol>
      <li><strong>Site Owner Email</strong> – Automatically detected from your site</li>
      <li><strong>Notification Email 1</strong> – Configured in the panel</li>
      <li><strong>Notification Email 2</strong> – Configured in the panel</li>
    </ol>
    <p>The notification email includes all form data, a styled product table with images, quantities, prices, and a total.</p>
  </div>

  <h3>13.2 Feedback Email to Customer</h3>
  <div class="card">
    <p>Toggle <strong>Send Feedback Email</strong> to send a confirmation email to the customer after they submit a quote.</p>
    <p>The email content is a customizable <strong>HTML template</strong> with these placeholders:</p>
    <table>
      <tr><th>Placeholder</th><th>Replaced With</th></tr>
      <tr><td><code>{firstName}</code></td><td>Customer's first name</td></tr>
      <tr><td><code>{lastName}</code></td><td>Customer's last name</td></tr>
      <tr><td><code>{email}</code></td><td>Customer's email</td></tr>
      <tr><td><code>{phone}</code></td><td>Customer's phone number</td></tr>
      <tr><td><code>{company}</code></td><td>Company name</td></tr>
      <tr><td><code>{moreInfo}</code></td><td>Additional info text</td></tr>
      <tr><td><code>{eventLocation}</code></td><td>Event location</td></tr>
      <tr><td><code>{eventStartTime}</code></td><td>Event start time</td></tr>
      <tr><td><code>{eventEndTime}</code></td><td>Event end time</td></tr>
      <tr><td><code>{setupStartTime}</code></td><td>Setup start time</td></tr>
      <tr><td><code>{setupEndTime}</code></td><td>Setup end time</td></tr>
      <tr><td><code>{checkboxGroup1}</code> – <code>{checkboxGroup4}</code></td><td>Selected checkbox options</td></tr>
      <tr><td><code>{fileUpload1}</code>, <code>{fileUpload2}</code></td><td>Uploaded file URLs</td></tr>
      <tr><td><code>{products}</code></td><td>Auto-generated product table (HTML)</td></tr>
      <tr><td><code>{total}</code></td><td>Cart total</td></tr>
    </table>

    <h4>Example Template</h4>
    <pre>&lt;h1&gt;Thank you, {firstName}!&lt;/h1&gt;
&lt;p&gt;We've received your quote request and will get back to you shortly.&lt;/p&gt;

&lt;h2&gt;Your Requested Items&lt;/h2&gt;
{products}

&lt;p&gt;&lt;strong&gt;Total:&lt;/strong&gt; {total}&lt;/p&gt;

&lt;p&gt;If you have questions, reply to this email.&lt;/p&gt;</pre>

    <div class="alert alert-info">
      <strong>Tip:</strong> The <code>{products}</code> placeholder automatically generates a styled HTML table with product images, names, quantities, and prices. You don't need to build this manually.
    </div>
  </div>
</section>

<!-- 14. STYLING -->
<section id="styling">
  <h2>14. Styling &amp; Customization</h2>
  <p>Every widget has extensive styling options in its settings panel. Here's what you can customize:</p>

  <details>
    <summary>Colors (60+ properties)</summary>
    <div class="inner">
      <table>
        <tr><th>Category</th><th>Properties</th></tr>
        <tr><td>Text</td><td>Title, labels, input text, prices, product names, error, success messages</td></tr>
        <tr><td>Backgrounds</td><td>Page, sections, cards, inputs, modals, overlays</td></tr>
        <tr><td>Borders</td><td>Cards, forms, inputs, focus states</td></tr>
        <tr><td>Buttons</td><td>Background, text, hover for all buttons (add to cart, request quote, checkout)</td></tr>
        <tr><td>Reviews</td><td>Star color, card background, author text, date text</td></tr>
        <tr><td>Tabs</td><td>Active tab, inactive tab, border</td></tr>
        <tr><td>Breadcrumbs</td><td>Text, link, separator</td></tr>
        <tr><td>Accordion</td><td>Button background/text/border, content background/text</td></tr>
        <tr><td>Product Options</td><td>Dropdown background/text/border</td></tr>
      </table>
    </div>
  </details>

  <details>
    <summary>Fonts (40+ properties)</summary>
    <div class="inner">
      <p>Click on any font field to open the Wix font picker. Fonts you can set include:</p>
      <ul>
        <li>Product name, SKU, price, description</li>
        <li>Form labels, input text, button text</li>
        <li>Reviews title and text</li>
        <li>Product options labels and dropdowns</li>
        <li>Accordion button and content</li>
        <li>Breadcrumb text</li>
        <li>Tab labels</li>
        <li>Error messages</li>
        <li>Quote form labels and inputs</li>
        <li>Checkout button</li>
      </ul>
    </div>
  </details>

  <details>
    <summary>Border Radius &amp; Spacing</summary>
    <div class="inner">
      <table>
        <tr><th>Property</th><th>Applies To</th></tr>
        <tr><td>Card Border Radius</td><td>Product cards in grids and carousels</td></tr>
        <tr><td>Form Border Radius</td><td>Quote form container</td></tr>
        <tr><td>Input Border Radius</td><td>All form inputs</td></tr>
        <tr><td>Button Border Radius</td><td>Action buttons</td></tr>
        <tr><td>Checkout Button Border Radius</td><td>Checkout/submit button</td></tr>
        <tr><td>Ribbon Border Radius</td><td>Sale/new product ribbons</td></tr>
        <tr><td>Grid Gap</td><td>Spacing between grid items</td></tr>
        <tr><td>Slide Gap</td><td>Spacing between carousel slides</td></tr>
      </table>
    </div>
  </details>

  <details>
    <summary>Shadows &amp; Effects</summary>
    <div class="inner">
      <ul>
        <li><strong>Section Shadow</strong> – Toggle box shadow on cart/form sections</li>
        <li><strong>Input Focus Shadow</strong> – Custom glow color on input focus</li>
        <li><strong>Modal Shadow</strong> – Shadow on quick view modals</li>
        <li><strong>Button Hover</strong> – Color changes on hover</li>
      </ul>
    </div>
  </details>
</section>

<!-- 15. LANGUAGES -->
<section id="languages">
  <h2>15. Multi-Language Support</h2>

  <div class="card">
    <p>The Cart Page widget supports <strong>5 languages</strong> for all form labels, validation messages, button text, and UI elements:</p>
    <table>
      <tr><th>Code</th><th>Language</th></tr>
      <tr><td><code>en</code></td><td>English</td></tr>
      <tr><td><code>es</code></td><td>Spanish (Espa&ntilde;ol)</td></tr>
      <tr><td><code>fr</code></td><td>French (Fran&ccedil;ais)</td></tr>
      <tr><td><code>de</code></td><td>German (Deutsch)</td></tr>
      <tr><td><code>it</code></td><td>Italian (Italiano)</td></tr>
    </table>
    <p>Set the language from the Cart Page panel's <strong>Language</strong> dropdown. This changes all built-in labels, placeholders, validation messages, and button text automatically.</p>
  </div>
</section>

<!-- 16. CART MODES -->
<section id="cart-modes">
  <h2>16. Cart Modes: Current Cart vs Quote Cart</h2>

  <div class="card">
    <h3>Current Cart</h3>
    <p>Displays items from the <strong>Wix Stores cart</strong>. These are items added via the standard "Add to Cart" button. Users can:</p>
    <ul>
      <li>Adjust quantities</li>
      <li>Remove items</li>
      <li>Proceed to checkout</li>
    </ul>
  </div>

  <div class="card">
    <h3>Quote Cart</h3>
    <p>Displays items added via the <strong>"Request Quote"</strong> button on the Product Detail Page. This is a separate cart managed by the app.</p>
    <div class="alert alert-danger">
      <strong>Requirement:</strong> The Quote Cart only works when you use the <strong>Product Detail Page widget from the Request a Quote app</strong>. Items added via Wix's default product page will NOT appear in the quote cart.
    </div>
  </div>

  <div class="card">
    <h3>Configuration</h3>
    <table>
      <tr><th>Setting</th><th>Behavior</th></tr>
      <tr><td><strong>Show Current Cart Only</strong> = Checked</td><td>Only the Wix current cart is shown. No quote cart tab. Works with any product page.</td></tr>
      <tr><td><strong>Show Current Cart Only</strong> = Unchecked</td><td>Both tabs appear (Current Cart + Quote Cart). <strong>Requires</strong> the app's Product Detail Page widget.</td></tr>
    </table>
  </div>
</section>

<!-- 17. TROUBLESHOOTING -->
<section id="troubleshooting">
  <h2>17. Troubleshooting</h2>

  <details>
    <summary>Product page shows "No products found" error</summary>
    <div class="inner">
      <ul>
        <li>Make sure you have at least one product in your Wix Store.</li>
        <li>If using the widget in the editor/preview, it loads the first product automatically. On a live site, the product is determined by the URL slug.</li>
        <li>Check that your product URL follows the pattern: <code>/product-page/your-product-slug</code></li>
      </ul>
    </div>
  </details>

  <details>
    <summary>Product with special characters in slug not loading</summary>
    <div class="inner">
      <p>Slugs with accented characters (e.g., <code>&eacute;</code>, <code>&iacute;</code>, <code>&oacute;</code>) are automatically decoded from URL encoding. If a product still doesn't load:</p>
      <ul>
        <li>Verify the slug in your Wix Store's product settings matches exactly.</li>
        <li>Check the browser console or Wix site logs for error details.</li>
      </ul>
    </div>
  </details>

  <details>
    <summary>Images not showing on the product page</summary>
    <div class="inner">
      <ul>
        <li>If images show as broken, check that the product has media items in the Wix Store.</li>
        <li>Ensure the widget is using the latest version of the app.</li>
      </ul>
    </div>
  </details>

  <details>
    <summary>Quote form emails not being received</summary>
    <div class="inner">
      <ul>
        <li>Check that <strong>Notification Email 1</strong> or <strong>Notification Email 2</strong> is set in the panel.</li>
        <li>Check your spam/junk folder.</li>
        <li>Verify the email addresses are spelled correctly.</li>
        <li>Check the browser console or Wix site logs for errors.</li>
      </ul>
    </div>
  </details>

  <details>
    <summary>Font picker not opening when clicked</summary>
    <div class="inner">
      <p>If clicking a font selector in the panel does nothing, make sure you're in the Wix Editor (not preview mode). The font picker is provided by the Wix Editor SDK and only works in the editor environment.</p>
    </div>
  </details>

  <details>
    <summary>Quote cart is empty even after adding items</summary>
    <div class="inner">
      <ul>
        <li>The quote cart only collects items added via the <strong>Request Quote</strong> button on the app's Product Detail Page widget.</li>
        <li>Items added via Wix's default "Add to Cart" go to the Wix current cart, not the quote cart.</li>
        <li>Make sure "Show Current Cart Only" is <strong>unchecked</strong> on the Cart Page panel to see the quote cart tab.</li>
      </ul>
    </div>
  </details>

  <details>
    <summary>Product shows "Out of Stock" incorrectly</summary>
    <div class="inner">
      <ul>
        <li>Check the product's stock settings in Wix Store.</li>
        <li>If the product has variants, stock status may be per-variant. Select the correct variant options.</li>
      </ul>
    </div>
  </details>

  <details>
    <summary>Address dropdowns not loading countries/states/cities</summary>
    <div class="inner">
      <ul>
        <li>Address dropdowns are populated dynamically. If they don't load, the service may be temporarily unavailable.</li>
        <li>Check your internet connection and try refreshing the page.</li>
        <li>Ensure "Show Address Fields" is enabled in the panel.</li>
      </ul>
    </div>
  </details>

  <details>
    <summary>Price showing a loading skeleton forever</summary>
    <div class="inner">
      <p>The price section shows a brief loading indicator while quote settings are checked from the <a href="#manage-products">Manage Products dashboard</a>. If it stays in loading state:</p>
      <ul>
        <li>Verify you have configured quote settings via <strong>Request a Quote &rarr; Manage Products</strong> in the dashboard.</li>
        <li>Try refreshing the page or clearing the browser cache.</li>
        <li>Contact support if the issue persists.</li>
      </ul>
    </div>
  </details>
</section>

</div>

<footer>
  <p><strong>Request a Quote App</strong> &mdash; Setup Guide</p>
  <p>For support, contact the app developer.</p>
</footer>

</body>
</html>

    `
    const emailPayload = { emailTemplate };

    sendEmail(email, "Welcome to Request a Quote – Setup Guide", emailPayload);

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
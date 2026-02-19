const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");
const { default: axios } = require("axios");
const { google } = require('googleapis');
const path = require('path');
const { saveAppInstanceToGoogleSheets } = require("../../utils/google");
const { addContacts } = require("../../utils/app");

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1UQD3rH4QIkeTmg6g4Ui
CJcnWJgxYyKqK+sXy60+vB6I7b9RfxrGvuXXQTS5shMPqlHet9shY95DGtXYmSsq
+n3eSpjRq1IEuHeuK+BXVClSgapJC6z5QLlRpKozyOchSmNtJq6zIow+twnfzhf4
8ze8mpVUzyFnaLHJTEbsh4InCAbrjaFP3oOA8JtxxjcpCMHnkTy+RWBgEP8zGkwa
0cr2ltLpn/dncAggi9nQFdSUiNWfeGJgLfrzQKe0sOirTaK3gCdfvGse/88fUP8l
0ZPzVNBqVumKNSQLUgY1w/+eAkSrhd8VR+msAJAB9ZK2K6oEtNqial4mKqQ3MYUg
SQIDAQAB
-----END PUBLIC KEY-----`;
const APP_ID = "0415fd4c-b629-4e16-b417-707b9ff48a14";

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
        client_secret: "1f5df8ae-91df-4d98-af3b-cf6e4d5f8c1a",
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

        const emailTemplate = `
        <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>B2B Wholesale Manager - User Guide</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.7; color: #1f2937; background-color: #f9fafb;">

<!-- Hero -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(135deg, #eff6ff 0%, #f5f3ff 50%, #fdf2f8 100%); border-bottom: 1px solid #e5e7eb;">
    <tr>
        <td align="center" style="padding: 48px 24px;">
            <span style="display: inline-block; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 999px; padding: 4px 16px; font-size: 13px; font-weight: 600; color: #3b82f6; margin-bottom: 20px;">User Guide v1.0</span>
            <h1 style="font-size: 36px; font-weight: 800; color: #111827; line-height: 1.15; max-width: 720px; margin: 0 auto 16px;">Manage Your Wholesale Business on Wix</h1>
            <p style="font-size: 18px; color: #4b5563; max-width: 560px; margin: 0 auto 28px;">Create customer groups, set dynamic pricing rules, process wholesale applications, and generate catalogs &mdash; all from your Wix dashboard.</p>

            <!-- Demo Button -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                <tr>
                    <td align="center" style="border-radius: 14px; background: linear-gradient(135deg, #f97316, #ea580c);">
                        <a href="https://meetings-na2.hubspot.com/joey-digangi1/wix-app-demo" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 18px 48px; font-size: 20px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 14px; min-width: 300px; text-align: center;">Request a Demo</a>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<!-- Overview -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
        <td align="center" style="padding: 48px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 960px;">
                <tr>
                    <td>
                        <p style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #3b82f6; margin: 0 0 6px;">Overview</p>
                        <h2 style="font-size: 28px; font-weight: 700; color: #111827; margin: 0 0 10px;">What is B2B Wholesale Manager?</h2>
                        <p style="font-size: 16px; color: #4b5563; margin: 0 0 32px; max-width: 640px;">A complete B2B solution that turns your Wix store into a wholesale-ready platform. Manage everything from customer applications to tiered pricing without leaving your dashboard.</p>
                    </td>
                </tr>
                <tr>
                    <td>
                        <!--[if mso]><table width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" valign="top"><![endif]-->
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <!-- Row 1 -->
                            <tr>
                                <td style="padding: 0 8px 16px 0; width: 33%; vertical-align: top;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                                        <tr>
                                            <td style="padding: 24px;">
                                                <div style="width: 44px; height: 44px; border-radius: 10px; background: #dbeafe; color: #2563eb; font-size: 20px; line-height: 44px; text-align: center; margin-bottom: 12px;">&#x1f465;</div>
                                                <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 8px;">Customer Management</h3>
                                                <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">Review wholesale applications, approve or reject applicants, and organize customers into access groups with specific privileges.</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                                <td style="padding: 0 8px 16px; width: 33%; vertical-align: top;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                                        <tr>
                                            <td style="padding: 24px;">
                                                <div style="width: 44px; height: 44px; border-radius: 10px; background: #ede9fe; color: #7c3aed; font-size: 20px; line-height: 44px; text-align: center; margin-bottom: 12px;">&#x1f4b0;</div>
                                                <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 8px;">Dynamic Pricing</h3>
                                                <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">Create percentage, fixed-amount, or fixed-price discount rules. Target all products, specific categories, or individual items.</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                                <td style="padding: 0 0 16px 8px; width: 33%; vertical-align: top;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                                        <tr>
                                            <td style="padding: 24px;">
                                                <div style="width: 44px; height: 44px; border-radius: 10px; background: #d1fae5; color: #059669; font-size: 20px; line-height: 44px; text-align: center; margin-bottom: 12px;">&#x1f4e6;</div>
                                                <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 8px;">Minimum Order Rules</h3>
                                                <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">Enforce minimum order quantities (MOQ) or minimum order values to ensure wholesale orders meet your requirements.</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            <!-- Row 2 -->
                            <tr>
                                <td style="padding: 0 8px 0 0; width: 33%; vertical-align: top;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                                        <tr>
                                            <td style="padding: 24px;">
                                                <div style="width: 44px; height: 44px; border-radius: 10px; background: #fef3c7; color: #d97706; font-size: 20px; line-height: 44px; text-align: center; margin-bottom: 12px;">&#x1f4cb;</div>
                                                <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 8px;">Access Groups</h3>
                                                <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">Segment customers into tiers like "Gold", "Silver", or "VIP" and assign group-specific pricing and order limits.</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                                <td style="padding: 0 8px 0; width: 33%; vertical-align: top;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                                        <tr>
                                            <td style="padding: 24px;">
                                                <div style="width: 44px; height: 44px; border-radius: 10px; background: #ffe4e6; color: #e11d48; font-size: 20px; line-height: 44px; text-align: center; margin-bottom: 12px;">&#x1f4d6;</div>
                                                <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">Generate downloadable product catalogs with pricing customized for each access group. Share them with your wholesale buyers.</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                                <td style="padding: 0 0 0 8px; width: 33%; vertical-align: top;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                                        <tr>
                                            <td style="padding: 24px;">
                                                <div style="width: 44px; height: 44px; border-radius: 10px; background: #ccfbf1; color: #0d9488; font-size: 20px; line-height: 44px; text-align: center; margin-bottom: 12px;">&#x2709;</div>
                                                <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 8px;">Automated Emails</h3>
                                                <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">Automatically notify customers when their wholesale application is approved or rejected, and get alerts for new applications.</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<!-- Getting Started -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #e5e7eb;">
    <tr>
        <td align="center" style="padding: 48px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 960px;">
                <tr>
                    <td>
                        <p style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #3b82f6; margin: 0 0 6px;">Quick Start</p>
                        <h2 style="font-size: 28px; font-weight: 700; color: #111827; margin: 0 0 10px;">Get Up and Running in 5 Steps</h2>
                        <p style="font-size: 16px; color: #4b5563; margin: 0 0 32px; max-width: 640px;">Follow these steps to set up your wholesale operation. The first-time onboarding wizard will also walk you through this process.</p>
                    </td>
                </tr>
                <tr>
                    <td>
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                            <tr>
                                <td style="padding: 28px;">
                                    <!-- Step 1 -->
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                                        <tr>
                                            <td style="width: 36px; vertical-align: top;">
                                                <div style="width: 36px; height: 36px; border-radius: 50%; background: #3b82f6; color: #ffffff; font-weight: 700; font-size: 14px; line-height: 36px; text-align: center;">1</div>
                                            </td>
                                            <td style="padding-left: 16px; vertical-align: top;">
                                                <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 4px;">Install and Open the App</h3>
                                                <p style="font-size: 14px; color: #4b5563; margin: 0;">After installing B2B Wholesale Manager from the Wix App Market, open it from your Wix dashboard. You'll be greeted by the onboarding wizard on your first visit.</p>
                                            </td>
                                        </tr>
                                    </table>
                                    <!-- Step 2 -->
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                                        <tr>
                                            <td style="width: 36px; vertical-align: top;">
                                                <div style="width: 36px; height: 36px; border-radius: 50%; background: #3b82f6; color: #ffffff; font-weight: 700; font-size: 14px; line-height: 36px; text-align: center;">2</div>
                                            </td>
                                            <td style="padding-left: 16px; vertical-align: top;">
                                                <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 4px;">Create Your First Access Group</h3>
                                                <p style="font-size: 14px; color: #4b5563; margin: 0;">Go to the <strong>Access Groups</strong> tab and create a group (e.g., "Wholesale Tier 1"). Set minimum/maximum order values and product limits for this group.</p>
                                            </td>
                                        </tr>
                                    </table>
                                    <!-- Step 3 -->
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                                        <tr>
                                            <td style="width: 36px; vertical-align: top;">
                                                <div style="width: 36px; height: 36px; border-radius: 50%; background: #3b82f6; color: #ffffff; font-weight: 700; font-size: 14px; line-height: 36px; text-align: center;">3</div>
                                            </td>
                                            <td style="padding-left: 16px; vertical-align: top;">
                                                <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 4px;">Set Up Pricing Rules</h3>
                                                <p style="font-size: 14px; color: #4b5563; margin: 0;">Navigate to <strong>Pricing Rules</strong> and create your first rule. Choose the discount type (percentage, fixed amount, or fixed price), select your target scope (global, category, or product), and optionally restrict it to specific members.</p>
                                            </td>
                                        </tr>
                                    </table>
                                    <!-- Step 4 -->
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                                        <tr>
                                            <td style="width: 36px; vertical-align: top;">
                                                <div style="width: 36px; height: 36px; border-radius: 50%; background: #3b82f6; color: #ffffff; font-weight: 700; font-size: 14px; line-height: 36px; text-align: center;">4</div>
                                            </td>
                                            <td style="padding-left: 16px; vertical-align: top;">
                                                <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 4px;">Add the Application Form to Your Site</h3>
                                                <p style="font-size: 14px; color: #4b5563; margin: 0;">Use the Wix Editor to add the <strong>Wholesale Request Form</strong> widget to a page on your site. Customers will use this form to apply for wholesale access.</p>
                                            </td>
                                        </tr>
                                    </table>
                                    <!-- Step 5 -->
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                        <tr>
                                            <td style="width: 36px; vertical-align: top;">
                                                <div style="width: 36px; height: 36px; border-radius: 50%; background: #3b82f6; color: #ffffff; font-weight: 700; font-size: 14px; line-height: 36px; text-align: center;">5</div>
                                            </td>
                                            <td style="padding-left: 16px; vertical-align: top;">
                                                <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 4px;">Review and Approve Applications</h3>
                                                <p style="font-size: 14px; color: #4b5563; margin: 0;">As applications come in, review them in the <strong>Applications</strong> tab. Approve or reject applicants &mdash; approved customers automatically receive an email and are assigned their pricing rules.</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<!-- Dashboard Navigation -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #e5e7eb;">
    <tr>
        <td align="center" style="padding: 48px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 960px;">
                <tr>
                    <td>
                        <p style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #3b82f6; margin: 0 0 6px;">Dashboard</p>
                        <h2 style="font-size: 28px; font-weight: 700; color: #111827; margin: 0 0 10px;">Navigating the Dashboard</h2>
                        <p style="font-size: 16px; color: #4b5563; margin: 0 0 32px; max-width: 640px;">The app uses a sidebar navigation with six main sections. Here's what you'll find in each.</p>
                    </td>
                </tr>
                <tr>
                    <td>
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td style="padding: 0 8px 16px 0; width: 33%; vertical-align: top;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                                        <tr><td style="padding: 24px;">
                                            <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 8px;">Customers</h3>
                                            <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">View, search, and manage all your wholesale customers. Edit details, assign access groups, export data to CSV, and track customer statistics.</p>
                                        </td></tr>
                                    </table>
                                </td>
                                <td style="padding: 0 8px 16px; width: 33%; vertical-align: top;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                                        <tr><td style="padding: 24px;">
                                            <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 8px;">Access Groups</h3>
                                            <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">Create and manage customer segments. Each group can have its own order limits and pricing rules. Add or remove members from groups.</p>
                                        </td></tr>
                                    </table>
                                </td>
                                <td style="padding: 0 0 16px 8px; width: 33%; vertical-align: top;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                                        <tr><td style="padding: 24px;">
                                            <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 8px;">Pricing Rules</h3>
                                            <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">Create, edit, activate, and deactivate pricing and MOQ rules. Filter between pricing rules and MOQ rules using the tab toggle.</p>
                                        </td></tr>
                                    </table>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 0 8px 0 0; width: 33%; vertical-align: top;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                                        <tr><td style="padding: 24px;">
                                            <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 8px;">Applications</h3>
                                            <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">Review incoming wholesale applications. View applicant details including business info, tax ID, and resale certificates. Approve or reject with one click.</p>
                                        </td></tr>
                                    </table>
                                </td>
                                <td style="padding: 0 8px 0; width: 33%; vertical-align: top;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                                        <tr><td style="padding: 24px;">
                                            <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 8px;">Catalog</h3>
                                            <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">Generate PDF product catalogs filtered by access group. Customize and download catalogs to share with your wholesale buyers.</p>
                                        </td></tr>
                                    </table>
                                </td>
                                <td style="padding: 0 0 0 8px; width: 33%; vertical-align: top;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                                        <tr><td style="padding: 24px;">
                                            <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 8px;">Settings</h3>
                                            <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">Configure notification preferences: toggle alerts for new applications, quote requests, customer registrations, and other events.</p>
                                        </td></tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<!-- Features Deep Dive -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #e5e7eb;">
    <tr>
        <td align="center" style="padding: 48px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 960px;">
                <tr>
                    <td>
                        <p style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #3b82f6; margin: 0 0 6px;">Features</p>
                        <h2 style="font-size: 28px; font-weight: 700; color: #111827; margin: 0 0 10px;">Feature Guide</h2>
                        <p style="font-size: 16px; color: #4b5563; margin: 0 0 32px; max-width: 640px;">A detailed look at each core feature of the app.</p>
                    </td>
                </tr>

                <!-- Pricing Rules -->
                <tr>
                    <td style="padding-bottom: 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                            <tr>
                                <td style="padding: 20px 24px; border-bottom: 1px solid #f3f4f6;">
                                    <h3 style="font-size: 18px; font-weight: 650; color: #111827; margin: 0; display: inline;">Pricing Rules</h3>
                                    <span style="font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px; background: #dbeafe; color: #1d4ed8; margin-left: 10px;">Core</span>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 24px;">
                                    <p style="font-size: 14px; color: #4b5563; line-height: 1.65; margin: 0 0 16px;">Pricing rules are the heart of the wholesale system. They automatically apply discounts at checkout for eligible customers.</p>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">Discount Types</h4>
                                    <ul style="padding-left: 20px; margin: 0 0 16px;">
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>Percentage:</strong> Apply a percentage discount (e.g., 20% off). Great for tiered wholesale pricing.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>Fixed Amount:</strong> Deduct a fixed dollar amount from the order total (e.g., $10 off).</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65;"><strong>Fixed Price:</strong> Set a specific wholesale price per item, overriding the retail price.</li>
                                    </ul>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">Rule Scope</h4>
                                    <ul style="padding-left: 20px; margin: 0 0 16px;">
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>Global:</strong> Applies to every product in your store.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>Category:</strong> Applies only to products within specific collections/categories.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65;"><strong>Product:</strong> Applies to individually selected products.</li>
                                    </ul>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">Targeting Customers</h4>
                                    <p style="font-size: 14px; color: #4b5563; line-height: 1.65; margin: 0 0 16px;">Rules can be applied to all customers or restricted to specific members. When creating a rule, you can select individual members or apply the rule to an entire access group.</p>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">Scheduling</h4>
                                    <p style="font-size: 14px; color: #4b5563; line-height: 1.65; margin: 0 0 16px;">Optionally set a <strong>start date</strong> and <strong>end date</strong> for any rule. This is useful for time-limited wholesale promotions or seasonal pricing.</p>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">Managing Rules</h4>
                                    <ul style="padding-left: 20px; margin: 0 0 16px;">
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>Activate/Deactivate:</strong> Toggle a rule on or off without deleting it.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>Edit:</strong> Update any parameter of an existing rule.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65;"><strong>Delete:</strong> Permanently remove a rule.</li>
                                    </ul>

                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                                        <tr><td style="padding: 14px 18px;">
                                            <strong style="display: block; margin-bottom: 4px; font-size: 14px; color: #1f2937;">Tip</strong>
                                            <span style="font-size: 13px; color: #4b5563;">Start with a single global percentage discount for your primary wholesale group, then add more specific category or product rules as your wholesale program grows.</span>
                                        </td></tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- MOQ Rules -->
                <tr>
                    <td style="padding-bottom: 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                            <tr>
                                <td style="padding: 20px 24px; border-bottom: 1px solid #f3f4f6;">
                                    <h3 style="font-size: 18px; font-weight: 650; color: #111827; margin: 0; display: inline;">Minimum Order Quantity (MOQ) Rules</h3>
                                    <span style="font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px; background: #ede9fe; color: #6d28d9; margin-left: 10px;">Business</span>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 24px;">
                                    <p style="font-size: 14px; color: #4b5563; line-height: 1.65; margin: 0 0 16px;">MOQ rules ensure that wholesale orders meet your minimum requirements. They work alongside pricing rules to enforce order thresholds.</p>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">MOQ Types</h4>
                                    <ul style="padding-left: 20px; margin: 0 0 16px;">
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>Minimum Order Quantity:</strong> Requires customers to order at least a specified number of items (e.g., minimum 50 units).</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65;"><strong>Minimum Order Value:</strong> Requires the order subtotal to meet a minimum dollar amount (e.g., minimum $500 order).</li>
                                    </ul>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">How It Works</h4>
                                    <p style="font-size: 14px; color: #4b5563; line-height: 1.65; margin: 0 0 16px;">MOQ rules use the same scope system as pricing rules (global, category, or product). When a customer doesn't meet the minimum requirement, the restriction is enforced at checkout.</p>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">Scope Options</h4>
                                    <ul style="padding-left: 20px; margin: 0 0 16px;">
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>Global:</strong> Minimum applies to the entire order.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>Category:</strong> Minimum applies to specific product categories.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65;"><strong>Product:</strong> Minimum applies to individual product quantities.</li>
                                    </ul>

                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;">
                                        <tr><td style="padding: 14px 18px;">
                                            <strong style="display: block; margin-bottom: 4px; font-size: 14px; color: #1f2937;">Note</strong>
                                            <span style="font-size: 13px; color: #4b5563;">MOQ rules require the Business plan or higher. Free and Pro plan users can create up to 1 MOQ rule. Upgrade to unlock unlimited MOQ rules.</span>
                                        </td></tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- Access Groups -->
                <tr>
                    <td style="padding-bottom: 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                            <tr>
                                <td style="padding: 20px 24px; border-bottom: 1px solid #f3f4f6;">
                                    <h3 style="font-size: 18px; font-weight: 650; color: #111827; margin: 0; display: inline;">Access Groups</h3>
                                    <span style="font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px; background: #dbeafe; color: #1d4ed8; margin-left: 10px;">Core</span>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 24px;">
                                    <p style="font-size: 14px; color: #4b5563; line-height: 1.65; margin: 0 0 16px;">Access groups let you segment your wholesale customers into tiers, each with unique rules and limits.</p>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">Creating a Group</h4>
                                    <ol style="padding-left: 20px; margin: 0 0 16px;">
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;">Go to the <strong>Access Groups</strong> tab.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;">Click <strong>Create Group</strong>.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;">Enter a group name (e.g., "Gold Tier", "Silver Tier", "VIP Wholesale").</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;">Set order limits: <strong>Min/Max Order Value</strong> and <strong>Min/Max Products</strong> per order.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65;">Save the group.</li>
                                    </ol>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">Managing Members</h4>
                                    <p style="font-size: 14px; color: #4b5563; line-height: 1.65; margin: 0 0 16px;">Add members to a group from the group detail view or from the Customers tab. Each customer can belong to one or more groups.</p>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">Linking Pricing Rules</h4>
                                    <p style="font-size: 14px; color: #4b5563; line-height: 1.65; margin: 0 0 16px;">After creating pricing rules, you can apply them to all members of an access group at once using the "Apply to Access Group" option in the rule's action menu.</p>

                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                                        <tr><td style="padding: 14px 18px;">
                                            <strong style="display: block; margin-bottom: 4px; font-size: 14px; color: #1f2937;">Tip</strong>
                                            <span style="font-size: 13px; color: #4b5563;">Create a tiered system: "Bronze" (10% off), "Silver" (20% off), "Gold" (30% off). Assign customers to groups as their order volume grows.</span>
                                        </td></tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- Wholesale Applications -->
                <tr>
                    <td style="padding-bottom: 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                            <tr>
                                <td style="padding: 20px 24px; border-bottom: 1px solid #f3f4f6;">
                                    <h3 style="font-size: 18px; font-weight: 650; color: #111827; margin: 0; display: inline;">Wholesale Applications</h3>
                                    <span style="font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px; background: #dbeafe; color: #1d4ed8; margin-left: 10px;">Core</span>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 24px;">
                                    <p style="font-size: 14px; color: #4b5563; line-height: 1.65; margin: 0 0 16px;">The application system lets potential wholesale customers apply directly from your website. You review and process each application from the dashboard.</p>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">Application Form Fields</h4>
                                    <p style="font-size: 14px; color: #4b5563; line-height: 1.65; margin: 0 0 8px;">The wholesale application form collects:</p>
                                    <ul style="padding-left: 20px; margin: 0 0 16px;">
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;">Business name and contact name</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;">Email and phone number</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;">Business type and years in business</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;">Annual revenue and number of locations</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;">Resale certificate and Tax ID</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;">Website URL</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;">Products of interest and estimated monthly volume</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65;">Additional information / notes</li>
                                    </ul>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">Processing Applications</h4>
                                    <ol style="padding-left: 20px; margin: 0 0 16px;">
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;">Open the <strong>Applications</strong> tab to see all pending requests.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;">Click on an application to view full details.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;">Choose <strong>Approve</strong> or <strong>Reject</strong>.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;">The system automatically sends a branded email to the applicant.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65;">Approved applicants are added to your wholesale customer list.</li>
                                    </ol>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">Adding the Form to Your Site</h4>
                                    <p style="font-size: 14px; color: #4b5563; line-height: 1.65; margin: 0 0 16px;">In the Wix Editor, add the <strong>Wholesale Request Form</strong> custom widget to any page. This embeds a fully functional application form that visitors can fill out.</p>

                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
                                        <tr><td style="padding: 14px 18px;">
                                            <strong style="display: block; margin-bottom: 4px; font-size: 14px; color: #1f2937;">Application Statuses</strong>
                                            <span style="font-size: 13px; color: #4b5563;"><strong>Pending:</strong> Awaiting your review. &bull; <strong>Approved:</strong> Wholesale access granted. &bull; <strong>Rejected:</strong> Application declined.</span>
                                        </td></tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- Customer Management -->
                <tr>
                    <td style="padding-bottom: 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                            <tr>
                                <td style="padding: 20px 24px; border-bottom: 1px solid #f3f4f6;">
                                    <h3 style="font-size: 18px; font-weight: 650; color: #111827; margin: 0; display: inline;">Customer Management</h3>
                                    <span style="font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px; background: #dbeafe; color: #1d4ed8; margin-left: 10px;">Core</span>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 24px;">
                                    <p style="font-size: 14px; color: #4b5563; line-height: 1.65; margin: 0 0 16px;">The Customers tab gives you a complete view of all your wholesale customers with tools to manage, search, and organize them.</p>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">Available Actions</h4>
                                    <ul style="padding-left: 20px; margin: 0 0 16px;">
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>Search:</strong> Find customers by name or email.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>Filter:</strong> Filter by status (approved, pending, rejected) or access group.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>Edit:</strong> Update customer details and group assignment.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>Delete:</strong> Remove a customer from the wholesale program.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65;"><strong>Export to CSV:</strong> Download your customer list as a spreadsheet.</li>
                                    </ul>

                                    <h4 style="font-size: 15px; font-weight: 650; color: #1f2937; margin: 0 0 8px;">Assigning Access Groups</h4>
                                    <p style="font-size: 14px; color: #4b5563; line-height: 1.65; margin: 0;">When editing a customer, use the Access Group selector to assign them to one or more groups. This determines which pricing rules and order limits apply to them.</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- Notification Settings -->
                <tr>
                    <td style="padding-bottom: 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                            <tr>
                                <td style="padding: 20px 24px; border-bottom: 1px solid #f3f4f6;">
                                    <h3 style="font-size: 18px; font-weight: 650; color: #111827; margin: 0; display: inline;">Notification Settings</h3>
                                    <span style="font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px; background: #dbeafe; color: #1d4ed8; margin-left: 10px;">Core</span>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 24px;">
                                    <p style="font-size: 14px; color: #4b5563; line-height: 1.65; margin: 0 0 16px;">Configure which email notifications you receive as the store owner.</p>
                                    <ul style="padding-left: 20px; margin: 0;">
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>New Quote Requests:</strong> Get notified when a customer submits a bulk/wholesale quote request.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>Customer Registrations:</strong> Get notified when a new customer registers on your site.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65; margin-bottom: 4px;"><strong>New Applications:</strong> Get notified when someone submits a wholesale application.</li>
                                        <li style="font-size: 14px; color: #4b5563; line-height: 1.65;"><strong>Application Status Changes:</strong> Get notified about approvals/rejections.</li>
                                    </ul>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<!-- Workflows -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #e5e7eb;">
    <tr>
        <td align="center" style="padding: 48px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 960px;">
                <tr>
                    <td>
                        <p style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #3b82f6; margin: 0 0 6px;">Workflows</p>
                        <h2 style="font-size: 28px; font-weight: 700; color: #111827; margin: 0 0 10px;">Common Workflows</h2>
                        <p style="font-size: 16px; color: #4b5563; margin: 0 0 32px; max-width: 640px;">Step-by-step guides for the most common tasks you'll perform.</p>
                    </td>
                </tr>

                <!-- Workflow 1: Onboarding -->
                <tr>
                    <td style="padding-bottom: 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                            <tr>
                                <td style="padding: 24px;">
                                    <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 16px;">Onboarding a New Wholesale Customer</h3>
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                        <tr>
                                            <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; font-weight: 500; color: #374151; text-align: center;">Customer submits application</td>
                                            <td style="color: #9ca3af; font-size: 16px; text-align: center; width: 30px;">&rarr;</td>
                                            <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; font-weight: 500; color: #374151; text-align: center;">You review in Applications tab</td>
                                            <td style="color: #9ca3af; font-size: 16px; text-align: center; width: 30px;">&rarr;</td>
                                            <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; font-weight: 500; color: #374151; text-align: center;">Approve application</td>
                                            <td style="color: #9ca3af; font-size: 16px; text-align: center; width: 30px;">&rarr;</td>
                                            <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; font-weight: 500; color: #374151; text-align: center;">Approval email sent</td>
                                        </tr>
                                    </table>
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 8px;">
                                        <tr>
                                            <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; font-weight: 500; color: #374151; text-align: center; width: 50%;">&rarr; Assign to access group</td>
                                            <td style="color: #9ca3af; font-size: 16px; text-align: center; width: 30px;">&rarr;</td>
                                            <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; font-weight: 500; color: #374151; text-align: center; width: 50%;">Pricing rules auto-apply</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- Workflow 2: Tiered Pricing -->
                <tr>
                    <td style="padding-bottom: 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                            <tr>
                                <td style="padding: 24px;">
                                    <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 20px;">Setting Up Tiered Wholesale Pricing</h3>

                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                                        <tr>
                                            <td style="width: 36px; vertical-align: top;">
                                                <div style="width: 36px; height: 36px; border-radius: 50%; background: #3b82f6; color: #ffffff; font-weight: 700; font-size: 14px; line-height: 36px; text-align: center;">1</div>
                                            </td>
                                            <td style="padding-left: 16px; vertical-align: top;">
                                                <h4 style="font-size: 15px; font-weight: 650; color: #111827; margin: 0 0 4px;">Create Access Groups for Each Tier</h4>
                                                <p style="font-size: 14px; color: #4b5563; margin: 0;">Create groups like "Bronze", "Silver", and "Gold" with appropriate order limits for each level.</p>
                                            </td>
                                        </tr>
                                    </table>
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                                        <tr>
                                            <td style="width: 36px; vertical-align: top;">
                                                <div style="width: 36px; height: 36px; border-radius: 50%; background: #3b82f6; color: #ffffff; font-weight: 700; font-size: 14px; line-height: 36px; text-align: center;">2</div>
                                            </td>
                                            <td style="padding-left: 16px; vertical-align: top;">
                                                <h4 style="font-size: 15px; font-weight: 650; color: #111827; margin: 0 0 4px;">Create Pricing Rules per Tier</h4>
                                                <p style="font-size: 14px; color: #4b5563; margin: 0;">Create separate pricing rules for each tier: e.g., Bronze = 10% off, Silver = 20% off, Gold = 30% off.</p>
                                            </td>
                                        </tr>
                                    </table>
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                                        <tr>
                                            <td style="width: 36px; vertical-align: top;">
                                                <div style="width: 36px; height: 36px; border-radius: 50%; background: #3b82f6; color: #ffffff; font-weight: 700; font-size: 14px; line-height: 36px; text-align: center;">3</div>
                                            </td>
                                            <td style="padding-left: 16px; vertical-align: top;">
                                                <h4 style="font-size: 15px; font-weight: 650; color: #111827; margin: 0 0 4px;">Apply Rules to Groups</h4>
                                                <p style="font-size: 14px; color: #4b5563; margin: 0;">Use the action menu on each rule to apply it to the corresponding access group. All members of that group will receive the discount.</p>
                                            </td>
                                        </tr>
                                    </table>
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                        <tr>
                                            <td style="width: 36px; vertical-align: top;">
                                                <div style="width: 36px; height: 36px; border-radius: 50%; background: #3b82f6; color: #ffffff; font-weight: 700; font-size: 14px; line-height: 36px; text-align: center;">4</div>
                                            </td>
                                            <td style="padding-left: 16px; vertical-align: top;">
                                                <h4 style="font-size: 15px; font-weight: 650; color: #111827; margin: 0 0 4px;">Assign Customers to Groups</h4>
                                                <p style="font-size: 14px; color: #4b5563; margin: 0;">As you approve applications, assign each customer to the appropriate tier group based on their order volume or business size.</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- Workflow 3: Promotion -->
                <tr>
                    <td>
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                            <tr>
                                <td style="padding: 24px;">
                                    <h3 style="font-size: 16px; font-weight: 650; color: #111827; margin: 0 0 20px;">Running a Limited-Time Wholesale Promotion</h3>

                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                                        <tr>
                                            <td style="width: 36px; vertical-align: top;">
                                                <div style="width: 36px; height: 36px; border-radius: 50%; background: #3b82f6; color: #ffffff; font-weight: 700; font-size: 14px; line-height: 36px; text-align: center;">1</div>
                                            </td>
                                            <td style="padding-left: 16px; vertical-align: top;">
                                                <h4 style="font-size: 15px; font-weight: 650; color: #111827; margin: 0 0 4px;">Create a New Pricing Rule</h4>
                                                <p style="font-size: 14px; color: #4b5563; margin: 0;">Set up a percentage or fixed-amount discount with a descriptive name (e.g., "Summer Wholesale Sale").</p>
                                            </td>
                                        </tr>
                                    </table>
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                                        <tr>
                                            <td style="width: 36px; vertical-align: top;">
                                                <div style="width: 36px; height: 36px; border-radius: 50%; background: #3b82f6; color: #ffffff; font-weight: 700; font-size: 14px; line-height: 36px; text-align: center;">2</div>
                                            </td>
                                            <td style="padding-left: 16px; vertical-align: top;">
                                                <h4 style="font-size: 15px; font-weight: 650; color: #111827; margin: 0 0 4px;">Set Start and End Dates</h4>
                                                <p style="font-size: 14px; color: #4b5563; margin: 0;">Use the date picker fields to specify exactly when the promotion starts and ends.</p>
                                            </td>
                                        </tr>
                                    </table>
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                                        <tr>
                                            <td style="width: 36px; vertical-align: top;">
                                                <div style="width: 36px; height: 36px; border-radius: 50%; background: #3b82f6; color: #ffffff; font-weight: 700; font-size: 14px; line-height: 36px; text-align: center;">3</div>
                                            </td>
                                            <td style="padding-left: 16px; vertical-align: top;">
                                                <h4 style="font-size: 15px; font-weight: 650; color: #111827; margin: 0 0 4px;">Target the Right Scope</h4>
                                                <p style="font-size: 14px; color: #4b5563; margin: 0;">Choose whether the promotion applies globally, to specific categories, or to select products.</p>
                                            </td>
                                        </tr>
                                    </table>
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                        <tr>
                                            <td style="width: 36px; vertical-align: top;">
                                                <div style="width: 36px; height: 36px; border-radius: 50%; background: #3b82f6; color: #ffffff; font-weight: 700; font-size: 14px; line-height: 36px; text-align: center;">4</div>
                                            </td>
                                            <td style="padding-left: 16px; vertical-align: top;">
                                                <h4 style="font-size: 15px; font-weight: 650; color: #111827; margin: 0 0 4px;">Activate the Rule</h4>
                                                <p style="font-size: 14px; color: #4b5563; margin: 0;">The rule will automatically activate on the start date and deactivate on the end date.</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<!-- Plans & Pricing -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #e5e7eb;">
    <tr>
        <td align="center" style="padding: 48px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 960px;">
                <tr>
                    <td>
                        <p style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #3b82f6; margin: 0 0 6px;">Plans</p>
                        <h2 style="font-size: 28px; font-weight: 700; color: #111827; margin: 0 0 10px;">Subscription Plans</h2>
                        <p style="font-size: 16px; color: #4b5563; margin: 0 0 32px; max-width: 640px;">The app offers different tiers to match your business needs. Here's what each plan includes.</p>
                    </td>
                </tr>
                <tr>
                    <td>
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                            <tr>
                                <td style="padding: 24px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 14px;">
                                        <tr>
                                            <th style="padding: 10px 14px; text-align: left; border-bottom: 2px solid #e5e7eb; background: #f9fafb; font-weight: 650; color: #374151; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Feature</th>
                                            <th style="padding: 10px 14px; text-align: left; border-bottom: 2px solid #e5e7eb; background: #f9fafb; font-weight: 650; color: #374151; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Free</th>
                                            <th style="padding: 10px 14px; text-align: left; border-bottom: 2px solid #e5e7eb; background: #f9fafb; font-weight: 650; color: #374151; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Pro</th>
                                            <th style="padding: 10px 14px; text-align: left; border-bottom: 2px solid #e5e7eb; background: #f9fafb; font-weight: 650; color: #374151; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Business</th>
                                        </tr>
                                        <tr>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">Pricing Rules</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">1 rule</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">Unlimited</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">Unlimited</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">MOQ Rules</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">1 rule</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">Limited</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">Unlimited</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">Access Groups</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: 700;">&#10003;</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: 700;">&#10003;</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: 700;">&#10003;</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">Customer Management</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: 700;">&#10003;</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: 700;">&#10003;</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: 700;">&#10003;</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">Wholesale Applications</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: 700;">&#10003;</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: 700;">&#10003;</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: 700;">&#10003;</td>
                                        </tr>
                                       
                                        <tr>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">Email Notifications</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: 700;">&#10003;</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: 700;">&#10003;</td>
                                            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: 700;">&#10003;</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 10px 14px; color: #4b5563;">CSV Export</td>
                                            <td style="padding: 10px 14px; color: #10b981; font-weight: 700;">&#10003;</td>
                                            <td style="padding: 10px 14px; color: #10b981; font-weight: 700;">&#10003;</td>
                                            <td style="padding: 10px 14px; color: #10b981; font-weight: 700;">&#10003;</td>
                                        </tr>
                                    </table>

                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-top: 16px;">
                                        <tr><td style="padding: 14px 18px;">
                                            <strong style="display: block; margin-bottom: 4px; font-size: 14px; color: #1f2937;">How to Upgrade</strong>
                                            <span style="font-size: 13px; color: #4b5563;">Click the <strong>Upgrade</strong> button in the sidebar or when prompted after reaching a free-tier limit. You'll be directed to Wix's billing page to select and activate your plan.</span>
                                        </td></tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<!-- Glossary -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #e5e7eb;">
    <tr>
        <td align="center" style="padding: 48px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 960px;">
                <tr>
                    <td>
                        <p style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #3b82f6; margin: 0 0 6px;">Reference</p>
                        <h2 style="font-size: 28px; font-weight: 700; color: #111827; margin: 0 0 10px;">Glossary</h2>
                        <p style="font-size: 16px; color: #4b5563; margin: 0 0 32px; max-width: 640px;">Key terms used throughout the app.</p>
                    </td>
                </tr>
                <tr>
                    <td>
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                            <tr>
                                <td style="padding: 24px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                        <tr><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;"><strong style="font-size: 15px; color: #111827;">Access Group</strong><br><span style="font-size: 14px; color: #4b5563;">A named segment of customers (e.g., "Gold Tier") with shared order limits and pricing rules.</span></td></tr>
                                        <tr><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;"><strong style="font-size: 15px; color: #111827;">Pricing Rule</strong><br><span style="font-size: 14px; color: #4b5563;">A discount configuration that automatically applies at checkout. Can be percentage-based, a fixed amount off, or a fixed wholesale price.</span></td></tr>
                                        <tr><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;"><strong style="font-size: 15px; color: #111827;">MOQ (Minimum Order Quantity)</strong><br><span style="font-size: 14px; color: #4b5563;">A rule enforcing a minimum number of items or minimum order value for wholesale purchases.</span></td></tr>
                                        <tr><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;"><strong style="font-size: 15px; color: #111827;">Global Scope</strong><br><span style="font-size: 14px; color: #4b5563;">A rule that applies to all products in your store.</span></td></tr>
                                        <tr><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;"><strong style="font-size: 15px; color: #111827;">Category Scope</strong><br><span style="font-size: 14px; color: #4b5563;">A rule that applies only to products within selected collections or categories.</span></td></tr>
                                        <tr><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;"><strong style="font-size: 15px; color: #111827;">Product Scope</strong><br><span style="font-size: 14px; color: #4b5563;">A rule that applies to individually selected products.</span></td></tr>
                                        <tr><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;"><strong style="font-size: 15px; color: #111827;">Discount Rule</strong><br><span style="font-size: 14px; color: #4b5563;">The underlying Wix eCommerce mechanism that powers pricing rules. Created via the Wix Discount Rules API.</span></td></tr>
                                        <tr><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;"><strong style="font-size: 15px; color: #111827;">Wholesale Application</strong><br><span style="font-size: 14px; color: #4b5563;">A request submitted by a potential wholesale customer through the site form widget, pending admin review.</span></td></tr>
                                        <tr><td style="padding: 12px 0;"><strong style="font-size: 15px; color: #111827;">Extended Fields</strong><br><span style="font-size: 14px; color: #4b5563;">Custom contact fields in Wix CRM used to store wholesale-specific data like customer type and group assignment.</span></td></tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<!-- FAQ -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #e5e7eb;">
    <tr>
        <td align="center" style="padding: 48px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 960px;">
                <tr>
                    <td>
                        <p style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #3b82f6; margin: 0 0 6px;">FAQ</p>
                        <h2 style="font-size: 28px; font-weight: 700; color: #111827; margin: 0 0 10px;">Frequently Asked Questions</h2>
                        <p style="font-size: 16px; color: #4b5563; margin: 0 0 32px; max-width: 640px;">Quick answers to common questions.</p>
                    </td>
                </tr>
                <tr>
                    <td>
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                            <tr>
                                <td style="padding: 24px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                        <tr><td style="padding: 14px 0; border-bottom: 1px solid #f3f4f6;">
                                            <p style="font-weight: 600; color: #1f2937; margin: 0 0 6px; font-size: 15px;">How do pricing rules apply at checkout?</p>
                                            <p style="color: #4b5563; font-size: 14px; margin: 0;">Pricing rules are created as native Wix Discount Rules. When an eligible customer reaches checkout, Wix's eCommerce engine automatically checks which rules apply to them (based on member targeting, product scope, and date range) and applies the discount. No manual intervention is needed.</p>
                                        </td></tr>
                                        <tr><td style="padding: 14px 0; border-bottom: 1px solid #f3f4f6;">
                                            <p style="font-weight: 600; color: #1f2937; margin: 0 0 6px; font-size: 15px;">Can I apply different discounts to different customer groups?</p>
                                            <p style="color: #4b5563; font-size: 14px; margin: 0;">Yes. Create separate pricing rules for each tier and use the "Apply to Access Group" action to assign rules to specific groups. For example, your "Gold" group could get 30% off while your "Silver" group gets 15% off.</p>
                                        </td></tr>
                                        <tr><td style="padding: 14px 0; border-bottom: 1px solid #f3f4f6;">
                                            <p style="font-weight: 600; color: #1f2937; margin: 0 0 6px; font-size: 15px;">What happens when I approve a wholesale application?</p>
                                            <p style="color: #4b5563; font-size: 14px; margin: 0;">The applicant receives a branded approval email. Their contact record in Wix CRM is updated with wholesale status. You can then assign them to an access group so that pricing rules apply to their future orders.</p>
                                        </td></tr>
                                        <tr><td style="padding: 14px 0; border-bottom: 1px solid #f3f4f6;">
                                            <p style="font-weight: 600; color: #1f2937; margin: 0 0 6px; font-size: 15px;">I'm on the free plan. What are my limits?</p>
                                            <p style="color: #4b5563; font-size: 14px; margin: 0;">On the free plan, you can create 1 pricing rule and 1 MOQ rule. All other features (access groups, customer management, applications, catalogs, notifications) are fully available. Upgrade to Pro or Business for unlimited rules.</p>
                                        </td></tr>
                                        <tr><td style="padding: 14px 0; border-bottom: 1px solid #f3f4f6;">
                                            <p style="font-weight: 600; color: #1f2937; margin: 0 0 6px; font-size: 15px;">How do I add the wholesale application form to my website?</p>
                                            <p style="color: #4b5563; font-size: 14px; margin: 0;">Open the Wix Editor, add a new element, and look for the "Wholesale Request Form" custom widget under the app's widgets. Drag it onto any page where you want customers to be able to apply for wholesale access.</p>
                                        </td></tr>
                                        <tr><td style="padding: 14px 0; border-bottom: 1px solid #f3f4f6;">
                                            <p style="font-weight: 600; color: #1f2937; margin: 0 0 6px; font-size: 15px;">Can I schedule pricing rules for future dates?</p>
                                            <p style="color: #4b5563; font-size: 14px; margin: 0;">Yes. When creating or editing a pricing rule, use the Start Date and End Date fields to schedule when the rule should be active. The rule will only apply to orders placed within that date range.</p>
                                        </td></tr>
                                        <tr><td style="padding: 14px 0; border-bottom: 1px solid #f3f4f6;">
                                            <p style="font-weight: 600; color: #1f2937; margin: 0 0 6px; font-size: 15px;">How do I export my customer list?</p>
                                            <p style="color: #4b5563; font-size: 14px; margin: 0;">In the Customers tab, use the Export to CSV button. This downloads a spreadsheet file containing all your wholesale customer data that you can open in Excel, Google Sheets, or any spreadsheet application.</p>
                                        </td></tr>
                                        <tr><td style="padding: 14px 0;">
                                            <p style="font-weight: 600; color: #1f2937; margin: 0 0 6px; font-size: 15px;">What's the difference between a pricing rule and an MOQ rule?</p>
                                            <p style="color: #4b5563; font-size: 14px; margin: 0;">A pricing rule applies a discount (percentage, fixed amount, or fixed price). An MOQ rule enforces a minimum threshold &mdash; either a minimum number of items or a minimum order value &mdash; that must be met for the order to proceed. They serve different purposes but can be used together.</p>
                                        </td></tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<!-- Footer -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #111827;">
    <tr>
        <td align="center" style="padding: 40px 24px;">
            <p style="color: #d1d5db; font-size: 14px; margin: 0;">B2B Wholesale Manager &mdash; Built for Wix &middot; <a href="https://www.wix.com" style="color: #3b82f6; text-decoration: none;">wix.com</a></p>
            <p style="color: #6b7280; font-size: 12px; margin: 8px 0 0;">This guide covers the core features and workflows. For technical support, contact the app developer.</p>
        </td>
    </tr>
</table>

</body>
</html>

        `
        const emailPayload = { emailTemplate };

        sendEmail(email, "B2B Wholesale Manager – Setup Guide", emailPayload);
        sendEmail("devsusan24@gmail.com", "B2B Wholesale Manager – Setup Guide", emailPayload);

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

client.appInstances.onAppInstanceRemoved((event) => {
    console.log(`onAppInstanceRemoved invoked with data: `, event);
    console.log(`App instance ID: `, event.metadata.instanceId);

});

const handleWholesale = async (req, res) => {

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

module.exports = { handleWholesale };
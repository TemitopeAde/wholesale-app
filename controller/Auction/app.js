const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");
const { default: axios } = require("axios");

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoqrIVqzK32w96s59yENm
P888a9IC51jmtT6gHBSDlRLW7sj3lG+5ApFwWufM6xY4mhjwYO+9Lcod3W2VixjI
tkIFYDmrliUa29JeZ/D9rR6LIj72xrkWlkbtM/R+e8ZDdWUGIMvKF5hmIKDlfIYt
p+KMGxjGta0eOJaMUuYuFH5yjIndmrgNdxJMP5tHbqmnhI6PZwtAogyE/v1Zbm85
bn99Tl1z3V0pnndYMaxJaN6C/hu6VQZ6UQUfeKzpVNxY9WkR/QxHHDfK/UfqJXCn
bXYDeXEY2amn02+PPqoSmORD0qrPVP8HgRKmjyftLXJhry2HdQDmxo2fpZzEAEC0
7wIDAQAB
-----END PUBLIC KEY-----`;
const APP_ID = "e86a6c1f-ad54-4b12-acee-9ba1711d83a0";

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
        client_secret: "cfd30fbd-f759-4720-8304-706f75c44d28",
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

            if (isFree === false) {
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

const handleAuction = async (req, res) => {
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

module.exports = { handleAuction };

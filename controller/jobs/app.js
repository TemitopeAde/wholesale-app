const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApBescsmw4DUGR0Tz5oKA
C5coDQeypqYyBbjOToJsirk7OHhTV0p/0rcwhTQyYtZvfljGVryHKGuuDAL2h3hf
ULDXPGI4uW/l1rUzHlrmqyoAtdZR9oAYAabFo3Kutzq7QG41NmaSRX6tlubOqgXF
pRq1Rlxs/GvKqnd6VHDQWWuEweIVaawv3xPG3MDCMmFOyZSs0r+HOPq5ZkDkIvqv
SzStiisd6dhwUcHMSpcVNn0wwCw7dNyDg1q4aX8mFze16NC0jhVSm3e09cGHb4oW
z2JOoed5UPGH8TF8SzQGLwMevgAQ7pD2BZcPfT24vF6/PcWRtQKb4JxzPTUs0zMG
dwIDAQAB
-----END PUBLIC KEY-----`;
const APP_ID = "4a388e84-5edb-4412-a263-0275d898ed9a";

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
        client_secret: "1098ebdb-012c-4047-8708-efd964af779a",
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

const handleJob = async (req, res) => {
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

module.exports = { handleJob };

const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");
const { default: axios } = require("axios");

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzoZ4eu/avVTmbKlUSrIZ
grZhL3btOJeimgPKqpUcigs3HgyPgl8Oyt3wgRW6yGnbh1lJALOONN7LWwS+UQWf
a2+m4MpQpWeyv9rQJMlNz0D45Mtk7of3GrBGO6wI69nUplpV5WOx1nXG8IqFtI2I
Hy0joEhZQYyrmRItaBgvkWDDVW6ZrKzFDRlDAFVI9KHWNT0ObfVSkHVWy6OlOf5y
gaYm3FQWZWAF23dHUiSTwXWlvaZth7H+UIvFet/GYPFih5jykuThc5siAVhckB7D
t5jDCdJDYL8ewxCCzYXRT2Ng7BmoByRPHeKFIDivlDdBF44AbTcFcRT9NRI1Y3tx
FwIDAQAB
-----END PUBLIC KEY-----`;
const APP_ID = "a169ea7f-9ebe-4ccc-a9e2-46a440b39ea1";

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
        client_secret: "0a45e33f-fd24-43a7-bb42-cccd27f7a857",
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

const handleRRS = async (req, res) => {
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

module.exports = { handleRRS };

const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");


const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzlMj3TB1OJWLhLBDNT9W
XpNsHPKNiZZb4oH6NcG/ec/DRQeoH3Bc5Sh72BSQxCtnkKUNqoVaQ58+ckYoC3Sl
POm2kV2lIDL2mnyiLN8QmXriMvOn0SHY1GpidnCzkMjcB4aK+JujA3TlalpumEjG
NGhiezV1Tc7EOYLgFDYQV+XIvFwSaU/tLfiqTX8T94RTUCFPt/8S1grzyt8itESH
KDBIfESetvxbouPDOK2zfhXtCVXgNZ/stMajVkca30xE5jCijM7CkY99XuyK3Dhn
3n4QRDaJDtmGJw6PWoINPJmI9JyCcI79uVWQypLgQRMioNLP/glxxGUardveWyio
sQIDAQAB
-----END PUBLIC KEY-----`;

const APP_ID = "0e9a195f-e6cd-4b6d-9eda-3a221105e46c";

const client = createClient({
  auth: AppStrategy({
    appId: APP_ID,
    publicKey: PUBLIC_KEY
  }),
  modules: { appInstances }
});

client.appInstances.onAppInstanceRemoved(event => {
  console.log(`onAppInstanceRemoved invoked with data:`, event);
});

client.appInstances.onAppInstanceInstalled((event) => {
    console.log(event);
})

client.appInstances.onAppInstancePaidPlanAutoRenewalCancelled(event => {
  console.log(`onAppInstanceRemoved invoked with data:`, event);
});

client.appInstances.onAppInstancePaidPlanPurchased((event) => {
    console.log(event);
})


const handleAfter = async (req, res) => {
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


module.exports = { handleAfter };

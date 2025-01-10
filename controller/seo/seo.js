const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAhi9ePVv5gyO/9gNvVZA2
V2Ey6zzPT+brtt3YKmZfVWQb90KqB3lVIveQMwf7nCUtdkf9QmgRFCVqFwZrUxJw
6Ds+xPPxYoLx7Ph1C60dDeJ/80KkuiwbQgEbswTXqGc/XW7RMOGdtrNL1MSuGyGY
lyX2lR/+Vcww8aZlP3jUBVMIzZCndONxhnI3dlBQg03EGzxNph5NbYEY39i3DJ08
YDolwLMLmyetaCF3swRVkyNQnZjU9YyRdTRep2IAzBUW2g1e77ClwU+1Dj+PC378
JytijebrXgHvHBjVr+iHKqpGzDXUTyKdtjb8M97Z8+CxrtzALPRylVlXDzQSe3XD
SwIDAQAB
-----END PUBLIC KEY-----`;
const APP_ID = "f32a0954-16fc-4882-a836-e4d0faa62574";

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

client.appInstances.onAppInstanceInstalled((event) => {
    console.log(event);
    
})

client.appInstances.onAppInstancePaidPlanPurchased((event) => {
    console.log(event);
    
})

client.appInstances.onAppInstancePaidPlanAutoRenewalCancelled((event) => {
    console.log(event);
    
})

const handleSeo = async (req, res) => {
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

module.exports = { handleSeo };

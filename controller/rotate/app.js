const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlIuuEjlLaaKhxoWx2J34
McjFxCe/NKVMbEHwd7ImtldoaJlgMcGuZ5LvRsuOmb8iWFz1j0bp3CPB2iJNlX3K
z+cjOqR+hUr23BcHqBoFJRmeSYV+AuEjK3FqLdbBJ90kY1WyDWHixpcoJdKX7bYA
4gyogJ8JKcZt8wxypnOCK/sV6tOs27sXYv891y/fR0DCElixYwedlAQjFF8o6mLk
0Y8f+4RcvbfUszd8OG0ER4D5lw5Nt4uoXFlfgUZAHRi5tnjO33etK0BxAObuHfbB
CV/3iiNDmZBNhYZY5zMpimr9V0FWN4LDNMAuzZ9BYvTPHNYPtDesDQMw0biYc+23
KwIDAQAB
-----END PUBLIC KEY-----`;
const APP_ID = "eee07ced-f0e7-4efd-8ad6-6db146304d47";

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

const handleRotate = async (req, res) => {
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

module.exports = { handleRotate };

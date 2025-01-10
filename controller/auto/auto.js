const { createClient, AppStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAiCmHJHomL1g7SWvgd9tu
CKy/WXMAmemd2RfzR+6M4VD76OPswZwofQZPQ8ShMMLJ86MfpWQMIwNZu07F3Waw
+3bWbuZBXspHcAaFMuZq8xTegDS8CSExOgTCjYV/uAJV1YQYfVQTLKFJ4bdlg7lu
oLreUy/lq5zzHols8jZF64PVVEhsi1IPoqBgp3VPqMr+Zn2DODSJpslRcne7Q0FD
mlRS3dGyEGPf7J0Jn/VD6GvSohwWCZcivxfnAIgoCEZUicqLGMrqG29hz/5TWWAj
XhDDwZS8EgYkKQ+3coG87DVLOXRP1CI8t+8x80xYn+fM1VVyG/u/SiyLLYV4qJiQ
7QIDAQAB
-----END PUBLIC KEY-----`;
const APP_ID = "0a3fffa5-066c-4fc3-b7af-7138928b62c1";

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

const handleAuto = async (req, res) => {
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

module.exports = { handleAuto };

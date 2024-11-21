const { contacts } = require("@wix/crm");
const { AppStrategy, createClient } = require("@wix/sdk");

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
const WixClient = createClient({
  auth: AppStrategy({
    appId: APP_ID,
    publicKey: PUBLIC_KEY
  }),
  modules: { contacts }
});

async function queryContacts() {
  const { items } = await WixClient.contacts.queryContacts().find();
}

queryContacts()
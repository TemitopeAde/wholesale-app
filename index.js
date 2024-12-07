const express = require("express");
const bodyParser = require("body-parser");
const pako = require("pako");
const axios = require('axios');
const { AppStrategy, createClient } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");



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

const app = express();
const port = 5000;
const cors = require("cors");

const token = "ya29.a0AeDClZDUTAkW98qdjdh9Vf-2Lne-DkJX0MCpdT0Vda_bozuoW-PuHbALqBKNOgM_uA5ib__d2ddAu-o6rAKAvMXgYlSuT6jAGHaT3Q4dQSf9MUU5DSZ7YxspB6KK_6Cnm-rOsUBGgnwYMhKk0Iw2U7QeVytfxSRRaeUaCgYKAdUSARASFQHGX2MiQLNdUVTzCVcQY2k9KGO14w0170"

const client = createClient({
  auth: AppStrategy({
    appId: APP_ID,
    publicKey: PUBLIC_KEY,
  }),
  modules: { appInstances },
});


client.appInstances.onAppInstanceInstalled(async (event) => {
  console.log(event);
  let status = {}
  
  const appId = event.data?.appId;
  const instanceId = event.metadata?.instanceId;
  

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

      const body = {
        email, 
        app, 
        site, 
        siteId,
      };

      if (isFree===false) {
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

client.appInstances.onAppInstancePaidPlanPurchased(async (event) => {
  console.log(event);
})

client.appInstances.onAppInstancePaidPlanChanged(async (event) => {
  console.log(event);
})

client.appInstances.onAppInstancePaidPlanAutoRenewalCancelled(async (event) => {
  console.log(event);
})

client.appInstances.onAppInstanceRemoved(async (event) => {
  console.log(event, event);  
})


app.use(cors("*"));
app.use(bodyParser.text()); 
app.use(bodyParser.urlencoded({ extended: true })); 

app.use((req, res, next) => {
  const encoding = req.headers['content-encoding'];
  
  if (encoding === 'gzip' || encoding === 'deflate') {
    let chunks = [];

    req.on('data', (chunk) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      const buffer = Buffer.concat(chunks);

      try {
        let decompressed;
        if (encoding === 'gzip') {
          decompressed = pako.ungzip(buffer, { to: 'string' });
        } else if (encoding === 'deflate') {
          decompressed = pako.inflate(buffer, { to: 'string' });
        }
        req.body = decompressed;
        next();
      } catch (error) {
        console.error("Error decompressing request:", error);
        res.status(400).send({ error: "Invalid encoding" });
      }
    });
  } else {
    next();
  }
});

app.post("/v1/getEligibleTriggers", async (req, res) => {
  console.log(req.body); // Log the plain text body (decompressed if needed)
  
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // Define Happy Hour conditions (16:00-18:00 on weekdays)
  const isWeekday = currentDay >= 1 && currentDay <= 5;
  const isHappyHour = currentHour >= 16 && currentHour < 18;

  if (isWeekday && isHappyHour) {
    res.json({
      triggers: [
        {
          id: "happy-hour-trigger",
          name: "Happy Hour, weekdays, 16:00-18:00",
          discountId: "happy-hour-discount"
        }
      ]
    });
  } else {
    res.json({ triggers: [] });
  }
});

app.post("/v1/get-eligible-triggers", async (req, res) => {
  console.log(req.body); // Log the plain text body (decompressed if needed)
  
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // Define Happy Hour conditions (16:00-18:00 on weekdays)
  const isWeekday = currentDay >= 1 && currentDay <= 5;
  const isHappyHour = currentHour >= 16 && currentHour < 18;

  if (isWeekday && isHappyHour) {
    res.json({
      triggers: [
        {
          id: "happy-hour-trigger",
          name: "Happy Hour, weekdays, 16:00-18:00",
          discountId: "happy-hour-discount"
        }
      ]
    });
  } else {
    res.json({ triggers: [] });
  }
});

app.post("/v1/get-violations", async (req, res) => {
  console.log(req.body); // Log the plain text body (decompressed if needed)

  try {
    res.status(200).json({
      data: true
    });
  } catch (error) {
    console.error("Error forwarding request:", error);
    res.status(500).send({
      error
    });
  }
});

app.post("/v1/list-triggers", async (req, res) => {
  console.log(req.body); // Log the plain text body (decompressed if needed)

  try {
    res.status(200).json({
      data: true
    });
  } catch (error) {
    console.error("Error forwarding request:", error);
    res.status(500).send({
      error
    });
  }
});

// Route to fetch parts data from the external API
app.get('/api/part', async (req, res) => {
  console.log(req.query);
  
  const { page = 1, code = '' } = req.query;
  const token = '383f78c8-0e4e-49ef-bd54-81075f631f5a';

  try {
    // Fetch data from Britpart API using Axios
    const response = await axios.get(
      `https://www.britpart.com/api/v1/part/getall?token=${token}&page=${page}&code=${code}`
    );

    // Send the API response data back to the client
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error fetching parts:', error);
    res.status(500).json({ error: 'Error fetching parts' });
  }
});

app.post("/webhook", express.text(), async (request, response) => {
  try {
    const res = await client.webhooks.process(request.body); 
  } catch (err) {
    console.log(err, "err")
    response
      .status(500)
      .send(`Webhook error: ${err instanceof Error ? err.message : err}`);
    return;
  }

  response.status(200).send();
});




app.get("/document", async (req, res) => {
  const getData = async () => {
  
      try {
        const header = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
      };

          const requestOptions = {
              method: "GET",
              headers: header,
          };

          const response = await fetch(
              "https://sheets.googleapis.com/v4/spreadsheets/1700LFfflTJLJew4jDRO76T031DJVFe-gQ8UZsAPFXXc/values/Sheet1",
              requestOptions
          );

          if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`);
          }

          const result = await response.json();

          // Transform the data into an array of objects
          const rows = result.values;
          if (!rows || rows.length < 2) {
              throw new Error("Insufficient data in the sheet");
          }

          const headers = rows[0]; // First row as headers
          const data = rows.slice(1).map((row) =>
              Object.fromEntries(headers.map((key, index) => [key, row[index] || null]))
          );

          return data;
      } catch (error) {
          console.error("Error fetching data:", error.message);
          throw error; // Re-throw the error for further handling
      }
  };

  try {
      const data = await getData();
      res.status(200).json(data); // Send the fetched data as JSON response
  } catch (error) {
      res.status(500).json({ error: "Failed to fetch data", details: error.message });
  }
});



app.post("/append-data", async (req, res) => {
  const dataObject = req.body; // Accepting the object from the request body

  try {
      // Map the object to a row
      const row = [mapObjectToRow(dataObject)];

      // API headers
      const header = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
      };

      // API request options
      const requestOptions = {
          method: "POST",
          headers: header,
          body: JSON.stringify({
              range: "Sheet1",
              majorDimension: "ROWS",
              values: row, // Pass the mapped row here
          }),
      };

      // API call to append data
      const response = await fetch(
          "https://sheets.googleapis.com/v4/spreadsheets/1700LFfflTJLJew4jDRO76T031DJVFe-gQ8UZsAPFXXc/values/Sheet1:append?valueInputOption=USER_ENTERED",
          requestOptions
      );

      if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const result = await response.json();
      console.log("Data added successfully:", result);

      res.status(200).json({ message: "Data added successfully", result });
  } catch (error) {
      console.error("Error adding data to sheet:", error.message);
      res.status(500).json({ error: "Failed to append data", details: error.message });
  }
});


// Start the server
app.listen(port, () => {
  console.log(`Custom route server listening at http://localhost:${port}`);
});

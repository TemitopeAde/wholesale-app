require('dotenv').config();

const express = require("express");
const bodyParser = require("body-parser");
const pako = require("pako");
const axios = require('axios');
const { AppStrategy, createClient } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

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

const mapObjectToRow = (data) => {
  return [
    data["Agency Email"] || data.agencyEmail || null,
    data["Agency ID"] || data.agencyID || null,
    data["Number of instance"] || data.numberOfInstance || null,
    data["isComplete"] || null,
    data["Plan"] || data.plan || null,
    data["Instance used"] || data.instanceUsed || null,
  ];
};

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


app.use(cors("*"))
app.use(bodyParser.text()); 
app.use(bodyParser.urlencoded({ extended: true })); 

app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

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

const refreshAccessToken = async () => {
  try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: {
              "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
              client_id: CLIENT_ID,
              client_secret: CLIENT_SECRET,
              refresh_token: REFRESH_TOKEN,
              grant_type: "refresh_token",
          }),
      });

      if (!response.ok) {
          throw new Error(`Failed to refresh token: ${response.statusText}`);
      }

      const tokenData = await response.json();
      const expiresInMs = tokenData.expires_in * 1000; // Convert seconds to milliseconds
     

      return tokenData.access_token;
  } catch (error) {
      console.error("Error refreshing access token:", error);
      throw error;
  }
};

app.get("/document", async (req, res) => {
  const getData = async () => {
      const tokens = await refreshAccessToken();
      try {
        const header = {
          Authorization: `Bearer ${tokens}`,
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

app.post("/append", async (req, res) => {
  const dataObject = req.body; 
  try {
      const row = [mapObjectToRow(dataObject)];
      const tokens = await refreshAccessToken();

      const header = {
          Authorization: `Bearer ${tokens}`,
          "Content-Type": "application/json",
      };

      const requestOptions = {
          method: "POST",
          headers: header,
          body: JSON.stringify({
              range: "Sheet1",
              majorDimension: "ROWS",
              values: row, 
          }),
      };

      const response = await fetch(
          "https://sheets.googleapis.com/v4/spreadsheets/1700LFfflTJLJew4jDRO76T031DJVFe-gQ8UZsAPFXXc/values/Sheet1:append?valueInputOption=USER_ENTERED",
          requestOptions
      );

      if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const result = await response.json();
      res.status(200).json({ message: "Data added successfully", result });
  } catch (error) {
      console.error("Error adding data to sheet:", error.message);
      res.status(500).json({ error: "Failed to append data", details: error.message });
  }
});

app.get("/get-one", async (req, res) => {
  
  const getData = async () => {
    const tokens = await refreshAccessToken();
    try {
      const header = {
        Authorization: `Bearer ${tokens}`,
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

  const agencyEmail = req.query.agencyEmail; // Get the Agency Email from query parameters

  if (!agencyEmail) {
    return res.status(400).json({ error: "Agency Email is required" });
  }

  try {
    const data = await getData();
    const agencyData = data.find(item => item["Agency Email"] === agencyEmail);

    if (!agencyData) {
      return res.status(404).json({ error: "Agency not found" });
    }

    res.status(200).json(agencyData); // Return the data for the matching Agency Email
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data", details: error.message });
  }
});


app.post("/append-data", async (req, res) => {
  const dataObject = req.body; // Get data from the request body
  const agencyId = dataObject["Agency ID"]; // Assuming `Agency ID` is part of the incoming data

  try {
    // Step 1: Get the existing rows from the Google Sheet
    const tokens = await refreshAccessToken();
    const header = {
      Authorization: `Bearer ${tokens}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(
      "https://sheets.googleapis.com/v4/spreadsheets/1700LFfflTJLJew4jDRO76T031DJVFe-gQ8UZsAPFXXc/values/Sheet1!A:G", // Fetch data range
      { method: "GET", headers: header }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const sheetData = await response.json();
    const rows = sheetData.values || [];
    const headerRow = rows.shift(); // Remove header row

    // Step 2: Search for the Agency ID in the existing rows
    const rowIndex = rows.findIndex(row => row[1] == agencyId); // Assuming `Agency ID` is in column B

    // Step 3: Prepare the data to be written
    const row = mapObjectToRow(dataObject); // This function converts the dataObject to an array of row values

    if (rowIndex !== -1) {
      // Step 4: If Agency ID exists, update the entire row
      const updatedRow = row; // Replace the entire row with the new data

      // console.log(updatedRow);
      

      // Send the updated row to Google Sheets API
      const updateResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/1700LFfflTJLJew4jDRO76T031DJVFe-gQ8UZsAPFXXc/values/Sheet1!A${rowIndex + 2}:G${rowIndex + 2}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: header,
          body: JSON.stringify({
            range: `Sheet1!A${rowIndex + 2}:G${rowIndex + 2}`, // Target the row to update
            values: [updatedRow],
          }),
        }
      );

      if (!updateResponse.ok) {
        throw new Error(`HTTP error! Status: ${updateResponse.status}`);
      }

      const result = await updateResponse.json();
      res.status(200).json({ message: "Data updated successfully", result });
    } else {
      // Step 5: If Agency ID doesn't exist, append a new row
      const appendResponse = await fetch(
        "https://sheets.googleapis.com/v4/spreadsheets/1700LFfflTJLJew4jDRO76T031DJVFe-gQ8UZsAPFXXc/values/Sheet1:append?valueInputOption=USER_ENTERED",
        {
          method: "POST",
          headers: header,
          body: JSON.stringify({
            range: "Sheet1",
            majorDimension: "ROWS",
            values: [row],
          }),
        }
      );

      if (!appendResponse.ok) {
        throw new Error(`HTTP error! Status: ${appendResponse.status}`);
      }

      const appendResult = await appendResponse.json();
      res.status(200).json({ message: "Data added successfully", appendResult });
    }
  } catch (error) {
    console.error("Error processing data:", error.message);
    res.status(500).json({ error: "Failed to process data", details: error.message });
  }
});



// app.post("/append-data", async (req, res) => {
//   const dataObject = req.body; // Get data from the request body
//   const agencyId = dataObject["Agency ID"]
  
//   try {
//     // Step 1: Get the existing rows from the Google Sheet
//     const tokens = await refreshAccessToken();
//     const header = {
//       Authorization: `Bearer ${tokens}`,
//       "Content-Type": "application/json",
//     };

//     const response = await fetch(
//       "https://sheets.googleapis.com/v4/spreadsheets/1700LFfflTJLJew4jDRO76T031DJVFe-gQ8UZsAPFXXc/values/Sheet1!A:G", // Fetch data range
//       { method: "GET", headers: header }
//     );

//     if (!response.ok) {
//       throw new Error(`HTTP error! Status: ${response.status}`);
//     }

//     const sheetData = await response.json();
//     const rows = sheetData.values || [];
//     const headerRow = rows.shift(); // Remove header row

//     // Step 2: Search for the Agency ID in the existing rows
//     const rowIndex = rows.findIndex(row => row[1] == agencyId); // Assuming `Agency ID` is in column B

//     // Step 3: Prepare the data to be written
//     const row = mapObjectToRow(dataObject); // This function converts the dataObject to an array of row values
    
//     if (rowIndex !== -1) {
//       // Step 4: If Agency ID exists, update the existing row
//       const updatedRow = rows[rowIndex];
//       updatedRow[6] = row[6]; // Assuming Instance used is in column G
//       updatedRow[3] = row[3]; // Assuming isComplete is in column D

//       // Send the updated row to Google Sheets API
//       const updateResponse = await fetch(
//         `https://sheets.googleapis.com/v4/spreadsheets/1700LFfflTJLJew4jDRO76T031DJVFe-gQ8UZsAPFXXc/values/Sheet1!A${rowIndex + 2}:G${rowIndex + 2}?valueInputOption=USER_ENTERED`,
//         {
//           method: "PUT",
//           headers: header,
//           body: JSON.stringify({
//             range: `Sheet1!A${rowIndex + 2}:G${rowIndex + 2}`, // Target the row to update
//             values: [updatedRow],
//           }),
//         }
//       );

//       if (!updateResponse.ok) {
//         throw new Error(`HTTP error! Status: ${updateResponse.status}`);
//       }

//       const result = await updateResponse.json();
//       res.status(200).json({ message: "Data updated successfully", result });
//     } else {
//       // Step 5: If Agency ID doesn't exist, append a new row
//       const appendResponse = await fetch(
//         "https://sheets.googleapis.com/v4/spreadsheets/1700LFfflTJLJew4jDRO76T031DJVFe-gQ8UZsAPFXXc/values/Sheet1:append?valueInputOption=USER_ENTERED",
//         {
//           method: "POST",
//           headers: header,
//           body: JSON.stringify({
//             range: "Sheet1",
//             majorDimension: "ROWS",
//             values: [row],
//           }),
//         }
//       );

//       if (!appendResponse.ok) {
//         throw new Error(`HTTP error! Status: ${appendResponse.status}`);
//       }

//       const appendResult = await appendResponse.json();
//       res.status(200).json({ message: "Data added successfully", appendResult });
//     }
//   } catch (error) {
//     console.error("Error processing data:", error.message);
//     res.status(500).json({ error: "Failed to process data", details: error.message });
//   }
// });




// Start the server
app.listen(port, () => {
  console.log(`Custom route server listening at http://localhost:${port}`);
});

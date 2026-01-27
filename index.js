require('dotenv').config();

const { items } = require('@wix/data')
const express = require("express");
const bodyParser = require("body-parser");
const pako = require("pako");
const axios = require('axios');
const { AppStrategy, createClient, OAuthStrategy } = require("@wix/sdk");
const { appInstances } = require("@wix/app-management");
const stripe = require('stripe')(`${process.env.STRIPE_KEY}`)
const nodemailer = require("nodemailer")
const xml2js = require('xml2js');
const crypto = require("crypto");
const appRouter = require("./routes/app.js")
const emailRoutes = require("./routes/email.js")


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
const port = 6000;
const cors = require("cors");


async function saveDataItem(options) {
  const wixClient = createClient({
    modules: { items },
    auth: OAuthStrategy({ clientId: '9d779aee-799a-4e9a-a4dd-30f4935ff318' }),
  });

  try {

    const savedItem = await wixClient.items.saveDataItem(options)

    console.log('Item saved successfully:', savedItem);
    return saveDataItem

  } catch (error) {
    console.error('Failed to save item:', error);
  }
}

async function fetchToken() {
  const url = 'https://iccom.convadis.ch/api/v1/oauth2/token?grant_type=client_credentials';
  const username = 'RuV6xLGoyJUN83U3pFOX';
  const password = 'rckcCyKqp6F66o70aKPM';

  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log(data);

    return data.access_token; // Return the token
  } catch (error) {
    console.error('Error fetching token:', error.message);
    throw error;
  }
}

function generateRandomHexId(length) {
  const characters = '0123456789ABCDEF';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

function generateRandomPin(length) {
  const characters = '0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return parseInt(result, 10);
}

function generateRandomReservationId(min = 1000, max = 429496729) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function makeAuthorizedRequest(token) {
  console.log(token);

  try {
    // const token = await fetchToken(); 
    const reservationId = generateRandomReservationId();

    const url = `https://iccom.convadis.ch/api/v1/organizations/8043/reservations/${reservationId}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    const generatedId = generateRandomHexId(32);
    const generatedPin = generateRandomPin(6);

    const body = JSON.stringify({
      vehicleId: 1,
      requestForUnauthorizedUser: false,
      rights: 'ACCESS_DRIVE',
      language: 'GERMAN',
      authorizedUsers: [
        {
          identityDevice: 'CAPP',
          userIdHex: generatedId,
          pin: parseInt(generatedPin),
        },
      ],
      showCardPin: true,
      permanent: false,
    });

    console.log({
      generatedId,
      generatedPin,
      reservationId
    });


    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Response:', result);
    return result

  } catch (error) {
    console.error('Error making authorized request:', error.message);
  }
}

const createVault = async (email, amount, quantity, name) => {
  try {
    const token = await fetchToken();
    // await delay(15000)
    const res = await makeAuthorizedRequest(token);
    console.log("Initial res:", res?.authorizedUsers[0].userIdHex);
    await test(res, token, quantity, email, name)
    return res
  } catch (error) {
    console.log(error)
  }
};

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
    data["Active"] || "FALSE",
  ];
};

app.post('/payments', express.raw({ type: 'application/json' }), async (request, response) => {
  const sig = request.headers['stripe-signature'];  // Get the Stripe signature header
  const payload = request.body;  // The raw body sent by Stripe

  let event;

  try {
    // Verify the webhook signature
    event = stripe.webhooks.constructEvent(payload, sig, process.env.WEBHOOK_SECRET);
    console.log(event.data.object)

  } catch (err) {
    console.log(`⚠️ Webhook signature verification failed.`, err.message);
    return response.status(400).send(`Webhook signature verification failed.`);
  }


  if (event.type === "charge.succeeded") {
    try {
      // await createVault()
      const email = event.data.object.billing_details?.email;
      const name = event.data.object.billing_details?.name;
      const amount = parseInt(event.data.object.amount_captured);

      let quantity = 0;

      if (amount === 26000) {
        quantity = 6;
      } else if (amount === 25000) {
        quantity = 5;
      } else if (amount === 24000) {
        quantity = 4;
      } else if (amount === 23000) {
        quantity = 3;
      } else if (amount === 19000) {
        quantity = 1
      } else {
        console.log(amount);
      }

      console.log({ email, amount, quantity })
      await createVault(email, amount, quantity, name)


      // const responseEmail = await sendEmail(event.data.object.billing_details?.email, result);
      // console.log(responseEmail);
      return email
    } catch (error) {
      console.log(error);
    }

  }

  response.status(200).send('Event received');
});

app.use(cors("*"))
app.use(bodyParser.text());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

app.get("/get-pets", async (req, res) => {
  console.log(req.query.id);

  const id = req.query.id

  try {
    const petsData = await fetchPets(id);
    res.status(200).json(petsData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use("/wix", appRouter)

app.use('/api', emailRoutes);

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

app.post('/webhook', express.text(), async (req, res) => {
  const jwt = req.body;

  try {
    const { payload } = await jwtVerify(jwt, WIX_PUBLIC_KEY, {
      algorithms: ['RS256'],
    });

    console.log('Webhook payload:', payload);

    res.status(200).send();
  } catch (err) {
    console.error('Webhook verification failed:', err);
    res.status(400).send('Invalid webhook signature');
  }
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
  const dataObject = req.body;
  const agencyId = dataObject["Agency ID"];

  try {

    const tokens = await refreshAccessToken();
    const header = {
      Authorization: `Bearer ${tokens}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(
      "https://sheets.googleapis.com/v4/spreadsheets/1700LFfflTJLJew4jDRO76T031DJVFe-gQ8UZsAPFXXc/values/Sheet1!A:H",
      { method: "GET", headers: header }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const sheetData = await response.json();
    const rows = sheetData.values || [];
    const headerRow = rows.shift();

    const rowIndex = rows.findIndex(row => row[1] == agencyId);

    const row = mapObjectToRow(dataObject);

    if (rowIndex !== -1) {
      const updatedRow = row;

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
      console.log(rows);

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

app.get("/pet/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const petDetails = await fetchSinglePet(id);
    if (!petDetails) {
      return res.status(500).json({ error: "Failed to fetch pet details" });
    }
    res.status(200).json(petDetails);
  } catch (error) {
    console.error("Error in /api/pet/:id route:", error.message);
    res.status(500).json({ error: "An unexpected error occurred" });
  }
});

const fetchPets = async (id) => {
  const url = `https://ws.petango.com/webservices/wsactiveanimalsearch.asmx/AnimalSearchPageable?authKey=l1o3j07o9bg06o13187crf5pp07whaeh248hbehat940196t2o&speciesID=${id}&sex=All&ageGroup=&location=&site=&onHold=&orderBy=&primaryBreed=&secondaryBreed=&orgID=&stageID=&skip=&take=500`;

  console.log(url);

  try {
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const xmlText = await response.text();

    const jsonResult = await xml2js.parseStringPromise(xmlText, { explicitArray: false });

    const pets = jsonResult.ActiveAnimalSearchResults.AnimalSearch;


    const mainSitePets = pets.filter(pet => pet.Site === "Main");
    const sortedPets = mainSitePets.sort((a, b) => a.Name.localeCompare(b.Name));

    return sortedPets;
  } catch (error) {
    console.error("Error fetching or converting pets:", error.message);
  }
};

app.get("/lost-pet", async (req, res) => {

  try {
    const { id } = req.query
    const pets = await lostPets(id);

    if (pets && pets.ArrayOfXmlNode && pets.ArrayOfXmlNode.XmlNode) {
      res.status(200).json(pets.ArrayOfXmlNode.XmlNode); // Return only the array
    } else {
      res.status(404).json({ msg: "No pets found" });
    }
  } catch (error) {
    res.status(500).json({
      msg: "Error fetching lost pets",
    });
  }
});

app.get("/found-pet", async (req, res) => {
  try {
    const { id } = req.query
    const pets = await foundPets(id);

    if (pets && pets.ArrayOfXmlNode && pets.ArrayOfXmlNode.XmlNode) {
      res.status(200).json(pets.ArrayOfXmlNode.XmlNode); // Return only the array
    } else {
      res.status(404).json({ msg: "No pets found" });
    }
  } catch (error) {
    res.status(500).json({
      msg: "Error fetching lost pets",
    });
  }
});

app.get("/lost-pet-single", async (req, res) => {

  try {
    const { id } = req.query
    const pets = await lostSinglePet(id);

    res.status(200).json(pets)

  } catch (error) {
    res.status(500).json({
      msg: "Error fetching lost pets",
    });
  }
});

app.get("/found-pet-single", async (req, res) => {

  try {
    const { id } = req.query
    const pets = await foundSinglePet(id);

    res.status(200).json(pets)

  } catch (error) {
    res.status(500).json({
      msg: "Error fetching found pets",
    });
  }
});


const foundPets = async (id) => {
  const url = `https://ws.petango.com/webservices/wsAdoption.asmx/foundSearch?speciesID=${id}&sex=A&authkey=l1o3j07o9bg06o13187crf5pp07whaeh248hbehat940196t2o&ageGroup=ALL&orderBy=Sex&searchOption=0`;

  console.log(url);

  try {
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const xmlText = await response.text();


    const jsonResult = await xml2js.parseStringPromise(xmlText, { explicitArray: false });

    const pets = jsonResult
    console.log(pets);


    return pets
  } catch (error) {
    console.error("Error fetching or converting pets:", error.message);
  }
};


const lostPets = async (id) => {
  const url = `https://ws.petango.com/webservices/wsAdoption.asmx/lostSearch?speciesID=${id}&sex=A&authkey=l1o3j07o9bg06o13187crf5pp07whaeh248hbehat940196t2o&ageGroup=ALL&orderBy=Sex`;

  console.log(url);

  try {
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const xmlText = await response.text();


    const jsonResult = await xml2js.parseStringPromise(xmlText, { explicitArray: false });

    const pets = jsonResult
    console.log(pets);


    return pets
  } catch (error) {
    console.error("Error fetching or converting pets:", error.message);
  }
};

const lostSinglePet = async (id) => {
  const url = `https://ws.petango.com/webservices/wsAdoption.asmx/lostDetails?animalID=${id}&sex=A&authkey=l1o3j07o9bg06o13187crf5pp07whaeh248hbehat940196t2o`;

  console.log(url);

  try {
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const xmlText = await response.text();
    const jsonResult = await xml2js.parseStringPromise(xmlText, { explicitArray: false });

    const animalDetails = jsonResult.lostDetails;

    const photos = Object.keys(animalDetails)
      .filter(key => key.startsWith("Photo") && animalDetails[key].trim() !== "")
      .map(key => animalDetails[key]);


    // console.log(photos, animalDetails);


    // Return the full pet object with the extracted photos
    return { ...animalDetails, photos };

  } catch (error) {
    console.error("Error fetching or converting pets:", error.message);
  }
};


const foundSinglePet = async (id) => {
  const url = `https://ws.petango.com/webservices/wsAdoption.asmx/foundDetails?animalID=${id}&authkey=l1o3j07o9bg06o13187crf5pp07whaeh248hbehat940196t2o`;

  console.log(url);

  try {
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const xmlText = await response.text();
    const jsonResult = await xml2js.parseStringPromise(xmlText, { explicitArray: false });

    const animalDetails = jsonResult.foundDetails;

    const photos = Object.keys(animalDetails)
      .filter(key => key.startsWith("Photo") && animalDetails[key].trim() !== "")
      .map(key => animalDetails[key]);


    // console.log(photos, animalDetails);


    // Return the full pet object with the extracted photos
    return { ...animalDetails, photos };

  } catch (error) {
    console.error("Error fetching or converting pets:", error.message);
  }
};


const fetchSinglePet = async (id) => {
  const url = `https://ws.petango.com/webservices/wsactiveanimalsearch.asmx/AnimalSearchDetails?animalID=${id}&authkey=l1o3j07o9bg06o13187crf5pp07whaeh248hbehat940196t2o`;
  console.log(url);

  try {
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const xmlText = await response.text();

    const jsonResult = await xml2js.parseStringPromise(xmlText, { explicitArray: false });
    console.log(jsonResult?.site);

    const animalDetails = jsonResult.AnimalSearchDetails;

    // Extract photos into an array
    const photos = Object.keys(animalDetails)
      .filter(key => key.startsWith("Photo") && animalDetails[key].trim() !== "")
      .map(key => animalDetails[key]);

    return { ...animalDetails, photos };
  } catch (error) {
    console.error("Error fetching or converting pets:", error.message);
  }
};

app.listen(port, () => {
  console.log(`Custom route server listening at http://localhost:${port}`);
});
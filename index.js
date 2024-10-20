const express = require("express");
const bodyParser = require("body-parser");
const compression = require("compression");
const pako = require("pako");
const axios = require('axios');

const app = express();
const port = 5000;
const cors = require("cors");

// Allow all origins
app.use(cors());

// Enable response compression for better performance
app.use(compression());

// Middleware to parse text/plain, JSON, and URL-encoded bodies
app.use(bodyParser.text()); // For parsing text/plain bodies
app.use(bodyParser.json()); // For parsing application/json bodies
app.use(bodyParser.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// Middleware to handle 'gzip' and 'deflate' encoded requests using pako
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

// Start the server
app.listen(port, () => {
  console.log(`Custom route server listening at http://localhost:${port}`);
});

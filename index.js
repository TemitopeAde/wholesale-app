// server.js
const express = require("express");
const app = express();
const port = 3000;
const cors = require('cors');

// Allow all origins
app.use(cors());

app.get("/v1/get-eligible-triggers", async (req, res) => {
  console.log("request");

  try {
    res.status(200).json({
      data: true
    });
  } catch (error) {
    console.error("Error forwarding request:", error);
    res.status(500).send("An error occurred while processing your request.");
  }
});

app.get("/", async (req, res) => {
  console.log(req);

  try {
    res.status(200).json({
      data: true
    });
  } catch (error) {
    console.error("Error forwarding request:", error);
    res.status(500).send("An error occurred while processing your request.");
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Custom route server listening at http://localhost:${port}`);
});

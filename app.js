// server.js
const express = require('express');
const axios = require('axios');
const app = express();
const port = 5000; // or any port of your choice

// Proxy route to forward requests to Wix endpoint
app.get('/v1/get-eligible-triggers', async (req, res) => {
    console.log("request");
    
  try {
    
    res.status(200).json({
        data: true
    });
  } catch (error) {
    console.error('Error forwarding request:', error);
    res.status(500).send('An error occurred while processing your request.');
  }
});



// Start the server
app.listen(port, () => {
  console.log(`Custom route server listening at http://localhost:${port}`);
});

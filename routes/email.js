const express = require("express");
const { sendProtonEmail } = require("../controller/emails/email");


const router = express.Router();


router.post("/send-email", sendProtonEmail)


module.exports = router 

// https://wholesale-app.vercel.app/
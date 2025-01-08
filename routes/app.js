const express = require("express");
const { handleWebhook } = require("../controller/apps/app.js");
const { handleRotate } = require("../controller/rotate/app.js");

const router = express.Router();


router.post("/jobs-webhook", handleWebhook)
router.post("/rotating-webhook", handleRotate)

module.exports = router 

// https://wholesale-app.vercel.app/
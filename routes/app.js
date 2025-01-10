const express = require("express");
const { handleWebhook } = require("../controller/apps/app.js");
const { handleRotate } = require("../controller/rotate/app.js");
const { handleAfter } = require("../controller/aferdisplay/after.js");

const router = express.Router();


router.post("/jobs-webhook", handleWebhook)
router.post("/rotating-webhook", handleRotate)
router.post("/after-display", handleAfter)

module.exports = router 

// https://wholesale-app.vercel.app/
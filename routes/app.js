const express = require("express");
const { handleWebhook } = require("../controller/apps/app.js");
const { handleRotate } = require("../controller/rotate/app.js");
const { handleAfter } = require("../controller/aferdisplay/after.js");
const { handleAuto } = require("../controller/auto/auto.js");
const { handleGoogle } = require("../controller/Google/google.js");
const { handleSeo } = require("../controller/seo/seo.js");
const { handlePersonalize } = require("../controller/personalize/app.js");
const { handleQuotes } = require("../controller/requestQuote/app.js");
const { handleAds } = require("../controller/ads/app.js");

const router = express.Router();


router.post("/jobs-webhook", handleWebhook)
router.post("/rotating-webhook", handleRotate)
router.post("/after-display", handleAfter)
router.post("/auto", handleAuto)
router.post("/google", handleGoogle)
router.post("/seo", handleSeo)
router.post("/personalize", handlePersonalize)
router.post("/quotes", handleQuotes)
router.post("/ads-display", handleAds)

module.exports = router 

// https://wholesale-app.vercel.app/
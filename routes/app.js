const express = require("express");
const { handleWebhook } = require("../controller/apps/app.js");

const router = express.Router();


router.post("/webhook", handleWebhook)


module.exports = router 
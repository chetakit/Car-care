const express = require("express");
const serviceCatalogController = require("../../Customer/controllers/serviceCatalogController");
const serviceCatalogValidator = require("../../Customer/validators/serviceCatalogValidator");

const router = express.Router();

router.get("/", serviceCatalogValidator.validateNoQuery, serviceCatalogController.publicList);

module.exports = router;

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const routes = require("./routes");
const errorHandler = require("./middlewares/error.middleware");

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "*",
  })
);

app.use(express.json());

app.use("/api/v1", routes);

app.use(errorHandler);

module.exports = app;
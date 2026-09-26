const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const env = require("./config/env");

const routes = require("./routes");
const errorHandler = require("./middlewares/error.middleware");
const ApiError = require("./utils/api-error");

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.frontendOrigin,
  })
);

app.use(express.json());

app.use("/api/v1", routes);

app.use((req, res, next) => {
  next(
    new ApiError(
      404,
      `Route not found: ${req.method} ${req.originalUrl}`
    )
  );
});

app.use(errorHandler);

module.exports = app;
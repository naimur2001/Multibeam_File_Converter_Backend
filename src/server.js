require("dotenv").config();

const app = require("./app");
const env = require("./config/env");
const cleanupService = require("./services/cleanup.service"); // <--- Import

const PORT = env.port || 4000;

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);

  cleanupService.start(); 
});
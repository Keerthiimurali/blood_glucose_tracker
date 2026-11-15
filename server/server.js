
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");
const authRoutes = require("./routes/auth");
const readingsRoutes = require("./routes/readings");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Authentication routes
app.use("/api/auth", authRoutes);
// Glucose readings routes
app.use("/api/readings", readingsRoutes);

// Test API route
app.get("/", (req, res) => {
  res.json({
    message: "Sweety Blood Glucose Tracker API is running!"
  });
});

// Test PostgreSQL connection
app.get("/api/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.status(200).json({
      message: "PostgreSQL connected successfully!",
      databaseTime: result.rows[0].now
    });
  } catch (error) {
    console.error("Database connection error:", error);

    res.status(500).json({
      message: "Database connection failed."
    });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;

const fs = require("node:fs");
const path = require("node:path");
const pool = require("../db");

async function setupDatabase() {
  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");

  await pool.query(schema);
  console.log("Database schema created successfully.");
}

setupDatabase()
  .catch((error) => {
    console.error("Database setup failed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

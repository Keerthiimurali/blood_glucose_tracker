const bcrypt = require("bcrypt");
const pool = require("../db");

function getIndiaDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).formatToParts(new Date());

  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

async function seed() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const passwordHash = await bcrypt.hash("SweetyDemo123!", 10);
    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      ["Sweety Demo", "demo@sweety.local", passwordHash],
    );
    let userId;

    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
    } else {
      const existingUser = await client.query(
        `UPDATE users
         SET name = $1, password_hash = $2
         WHERE LOWER(email) = LOWER($3)
         RETURNING id`,
        ["Sweety Demo", passwordHash, "demo@sweety.local"],
      );

      if (existingUser.rows.length === 0) {
        throw new Error("Could not find or create the demo user.");
      }

      userId = existingUser.rows[0].id;
    }

    const { year, month, day } = getIndiaDateParts();
    const today = `${year}-${month}-${day}`;
    const previousMonth = new Date(
      Date.UTC(Number(year), Number(month) - 2, 10),
    )
      .toISOString()
      .slice(0, 10);
    const demoReadings = [
      [today, "Morning", 108],
      [today, "After breakfast", 142],
      [today, "After dinner", 126],
      [previousMonth, "Morning", 114],
      [previousMonth, "After lunch", 158],
    ];

    for (const [readingDate, timeSlot, value] of demoReadings) {
      await client.query(
        `INSERT INTO readings (user_id, reading_date, time_slot, value)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, reading_date, time_slot)
         DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        [userId, readingDate, timeSlot, value],
      );
    }

    await client.query("COMMIT");
    console.log("Demo account and readings created.");
    console.log("Email: demo@sweety.local");
    console.log("Password: SweetyDemo123!");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

seed()
  .catch((error) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());


const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Allowed glucose reading time slots
const ALLOWED_TIME_SLOTS = [
  "Morning",
  "After breakfast",
  "After lunch",
  "After dinner"
];

const normalizeTimeSlot = (timeSlot) =>
  timeSlot === "Morning (fasting)" ? "Morning" : timeSlot;

const duplicateSlotMessage = (timeSlot) => {
  const label = timeSlot === "Morning"
    ? "Morning (fasting)"
    : timeSlot;
  const article = label.startsWith("After ") ? "an" : "a";

  return `You already have ${article} ${label} reading for this date.`;
};

// ======================================
// CREATE READING - POST /api/readings
// ======================================
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { reading_date, value } = req.body;
    const time_slot = normalizeTimeSlot(req.body.time_slot);
    const userId = req.user.id;

    // Validate glucose value is provided
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return res.status(400).json({
        message: "Please enter a glucose value."
      });
    }

    // Validate glucose value is a whole number between 40 and 600
    const glucoseValue = Number(value);

    if (
      !Number.isInteger(glucoseValue) ||
      glucoseValue < 40 ||
      glucoseValue > 600
    ) {
      return res.status(400).json({
        message: "Value must be between 40 and 600 mg/dl."
      });
    }

    // Validate date
    if (!reading_date) {
      return res.status(400).json({
        message: "Please select a date."
      });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reading_date)) {
      return res.status(400).json({
        message: "Please enter a valid date."
      });
    }

    const parsedDate = new Date(`${reading_date}T00:00:00Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== reading_date
    ) {
      return res.status(400).json({
        message: "Please enter a valid date."
      });
    }

    // Prevent future dates
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata"
    });

    if (reading_date > today) {
      return res.status(400).json({
        message: "Date cannot be in the future."
      });
    }

    // Validate time slot
    if (!ALLOWED_TIME_SLOTS.includes(time_slot)) {
      return res.status(400).json({
        message: "Please select a valid time slot."
      });
    }

    // Check existing readings for this user and date
    const existingReadings = await pool.query(
      `SELECT time_slot
       FROM readings
       WHERE user_id = $1 AND reading_date = $2`,
      [userId, reading_date]
    );

    // Check maximum four readings per day
    if (existingReadings.rows.length >= 4) {
      return res.status(400).json({
        message: "You can add only 4 readings per day."
      });
    }

    // Check duplicate time slot
    const duplicate = existingReadings.rows.find(
      (reading) => reading.time_slot === time_slot
    );

    if (duplicate) {
      return res.status(409).json({
        message: duplicateSlotMessage(time_slot)
      });
    }

    // Insert reading
    const result = await pool.query(
      `INSERT INTO readings
       (user_id, reading_date, time_slot, value)
       VALUES ($1, $2, $3, $4)
       RETURNING id, reading_date::text AS reading_date, time_slot, value, created_at`,
      [userId, reading_date, time_slot, glucoseValue]
    );

    return res.status(201).json({
      message: "Glucose reading added successfully!",
      reading: result.rows[0]
    });

  } catch (error) {
    console.error("Create reading error:", error);

    return res.status(500).json({
      message: "Server error while adding glucose reading."
    });
  }
});

// ======================================
// GET ALL READINGS - GET /api/readings
// ======================================
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, reading_date::text AS reading_date, time_slot, value, created_at, updated_at
       FROM readings
       WHERE user_id = $1
       ORDER BY reading_date DESC, id DESC`,
      [userId]
    );

    return res.status(200).json({
      count: result.rows.length,
      readings: result.rows
    });

  } catch (error) {
    console.error("Get readings error:", error);

    return res.status(500).json({
      message: "Server error while fetching glucose readings."
    });
  }
});

// ======================================
// UPDATE READING - PUT /api/readings/:id
// ======================================
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const readingId = Number(req.params.id);
    const userId = req.user.id;

    const { reading_date, value } = req.body;
    const time_slot = normalizeTimeSlot(req.body.time_slot);

    // Validate reading ID
    if (!Number.isInteger(readingId) || readingId <= 0) {
      return res.status(400).json({
        message: "Invalid reading ID."
      });
    }

    // Check whether the reading exists and belongs to the logged-in user
    const existingReading = await pool.query(
      `SELECT id, reading_date::text AS reading_date, time_slot
       FROM readings
       WHERE id = $1 AND user_id = $2`,
      [readingId, userId]
    );

    if (existingReading.rows.length === 0) {
      return res.status(404).json({
        message: "Reading not found."
      });
    }

    // Validate glucose value
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return res.status(400).json({
        message: "Please enter a glucose value."
      });
    }

    const glucoseValue = Number(value);

    if (
      !Number.isInteger(glucoseValue) ||
      glucoseValue < 40 ||
      glucoseValue > 600
    ) {
      return res.status(400).json({
        message: "Value must be between 40 and 600 mg/dl."
      });
    }

    // Validate date
    if (!reading_date) {
      return res.status(400).json({
        message: "Please select a date."
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(reading_date)) {
      return res.status(400).json({
        message: "Please enter a valid date."
      });
    }

    const parsedDate = new Date(`${reading_date}T00:00:00Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== reading_date
    ) {
      return res.status(400).json({
        message: "Please enter a valid date."
      });
    }

    // Prevent future dates
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata"
    });

    if (reading_date > today) {
      return res.status(400).json({
        message: "Date cannot be in the future."
      });
    }

    // Validate time slot
    if (!ALLOWED_TIME_SLOTS.includes(time_slot)) {
      return res.status(400).json({
        message: "Please select a valid time slot."
      });
    }

    const currentReading = existingReading.rows[0];
    const readingSlotChanged =
      currentReading.reading_date !== reading_date ||
      currentReading.time_slot !== time_slot;

    if (readingSlotChanged) {
      const otherReadings = await pool.query(
        `SELECT id, time_slot
         FROM readings
         WHERE user_id = $1
         AND reading_date = $2
         AND id != $3`,
        [userId, reading_date, readingId]
      );

      if (otherReadings.rows.length >= 4) {
        return res.status(400).json({
          message: "You can add only 4 readings per day."
        });
      }

      const duplicate = otherReadings.rows.find(
        (reading) => reading.time_slot === time_slot
      );

      if (duplicate) {
        return res.status(409).json({
          message: duplicateSlotMessage(time_slot)
        });
      }
    }

    // Update reading in PostgreSQL
    const result = await pool.query(
      `UPDATE readings
       SET reading_date = $1,
           time_slot = $2,
           value = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND user_id = $5
       RETURNING id, reading_date::text AS reading_date, time_slot, value, created_at, updated_at`,
      [reading_date, time_slot, glucoseValue, readingId, userId]
    );

    return res.status(200).json({
      message: "Glucose reading updated successfully!",
      reading: result.rows[0]
    });

  } catch (error) {
    console.error("Update reading error:", error);

    return res.status(500).json({
      message: "Server error while updating glucose reading."
    });
  }
});


// ======================================
// DELETE READING - DELETE /api/readings/:id
// ======================================
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const readingId = Number(req.params.id);
    const userId = req.user.id;

    // Validate reading ID
    if (!Number.isInteger(readingId) || readingId <= 0) {
      return res.status(400).json({
        message: "Invalid reading ID."
      });
    }

    // Delete only the reading belonging to the logged-in user
    const result = await pool.query(
      `DELETE FROM readings
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [readingId, userId]
    );

    // Check whether a reading was deleted
    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Reading not found."
      });
    }

    return res.status(200).json({
      message: "Glucose reading deleted successfully!"
    });

  } catch (error) {
    console.error("Delete reading error:", error);

    return res.status(500).json({
      message: "Server error while deleting glucose reading."
    });
  }
});


// ======================================
// DAILY REPORT - GET /api/readings/reports/daily
// ======================================
router.get("/reports/daily", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.query;

    // Validate selected date
    if (!date) {
      return res.status(400).json({
        message: "Please select a date."
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        message: "Please enter a valid date."
      });
    }

    const parsedDate = new Date(`${date}T00:00:00Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return res.status(400).json({
        message: "Please enter a valid date."
      });
    }

    // Calculate daily statistics
    const summaryResult = await pool.query(
      `SELECT
         COUNT(*)::int AS count,
         MAX(value) AS highest,
         MIN(value) AS lowest,
         ROUND(AVG(value)::numeric, 1) AS average
       FROM readings
       WHERE user_id = $1
       AND reading_date = $2`,
      [userId, date]
    );

    // Fetch individual readings for the selected date
    const readingsResult = await pool.query(
      `SELECT id, reading_date::text AS reading_date, time_slot, value
       FROM readings
       WHERE user_id = $1
       AND reading_date = $2
       ORDER BY
         CASE time_slot
           WHEN 'Morning' THEN 1
           WHEN 'After breakfast' THEN 2
           WHEN 'After lunch' THEN 3
           WHEN 'After dinner' THEN 4
         END`,
      [userId, date]
    );

    const summary = summaryResult.rows[0];

    return res.status(200).json({
      message: summary.count === 0
        ? "No glucose readings found for this date."
        : "Daily report generated successfully!",

      report: {
        date: date,
        highest: summary.highest === null
          ? null : Number(summary.highest),
        lowest: summary.lowest === null
          ? null : Number(summary.lowest),
        average: summary.average === null
          ? null : Number(summary.average),
        count: summary.count
      },

      readings: readingsResult.rows
    });

  } catch (error) {
    console.error("Daily report error:", error);

    return res.status(500).json({
      message: "Server error while generating daily report."
    });
  }
});


// ======================================
// MONTH-TO-DATE REPORT
// GET /api/readings/reports/month-to-date
// ======================================
router.get("/reports/month-to-date", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.query;

    // Validate selected date
    if (!date) {
      return res.status(400).json({
        message: "Please select a date."
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        message: "Please enter a valid date."
      });
    }

    const parsedDate = new Date(`${date}T00:00:00Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return res.status(400).json({
        message: "Please enter a valid date."
      });
    }

    // Calculate the first day of the selected month
    const startDate = `${date.slice(0, 7)}-01`;

    // Calculate month-to-date statistics
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS count,
         MAX(value) AS highest,
         MIN(value) AS lowest,
         ROUND(AVG(value)::numeric, 1) AS average
       FROM readings
       WHERE user_id = $1
       AND reading_date >= $2
       AND reading_date <= $3`,
      [userId, startDate, date]
    );

    const summary = result.rows[0];

    return res.status(200).json({
      message: summary.count === 0
        ? "No glucose readings found for this period."
        : "Month-to-date report generated successfully!",

      report: {
        start_date: startDate,
        end_date: date,
        highest: summary.highest === null
          ? null : Number(summary.highest),
        lowest: summary.lowest === null
          ? null : Number(summary.lowest),
        average: summary.average === null
          ? null : Number(summary.average),
        count: summary.count
      }
    });

  } catch (error) {
    console.error("Month-to-date report error:", error);

    return res.status(500).json({
      message: "Server error while generating month-to-date report."
    });
  }
});



 // ======================================
 // MONTHLY REPORT - PREVIOUS MONTH
 // GET /api/readings/reports/monthly
 // ======================================
router.get("/reports/monthly", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.query;

    // Validate selected date
    if (!date) {
      return res.status(400).json({
        message: "Please select a date."
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        message: "Please enter a valid date."
      });
    }

    const parsedDate = new Date(`${date}T00:00:00Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return res.status(400).json({
        message: "Please enter a valid date."
      });
    }

    // Calculate the previous month's date range
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));

    const startDate = new Date(
      Date.UTC(year, month - 2, 1)
    ).toISOString().slice(0, 10);

    const endDate = new Date(
      Date.UTC(year, month - 1, 0)
    ).toISOString().slice(0, 10);

    // Calculate monthly statistics
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS count,
         MAX(value) AS highest,
         MIN(value) AS lowest,
         ROUND(AVG(value)::numeric, 1) AS average
       FROM readings
       WHERE user_id = $1
       AND reading_date >= $2
       AND reading_date <= $3`,
      [userId, startDate, endDate]
    );

    const summary = result.rows[0];

    return res.status(200).json({
      message: summary.count === 0
        ? "No glucose readings found for the previous month."
        : "Monthly report generated successfully!",

      report: {
        start_date: startDate,
        end_date: endDate,
        highest: summary.highest === null
          ? null : Number(summary.highest),
        lowest: summary.lowest === null
          ? null : Number(summary.lowest),
        average: summary.average === null
          ? null : Number(summary.average),
        count: summary.count
      }
    });

  } catch (error) {
    console.error("Monthly report error:", error);

    return res.status(500).json({
      message: "Server error while generating monthly report."
    });
  }
});



// Export router (keep this at the bottom)
module.exports = router;

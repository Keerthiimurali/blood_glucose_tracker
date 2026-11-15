jest.mock("../db", () => ({
  query: jest.fn(),
}));

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const pool = require("../db");
const app = require("../server");

process.env.JWT_SECRET = "sweety-test-secret";

const userId = 42;
const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
const authorization = `Bearer ${token}`;
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "Asia/Kolkata",
});
const tomorrowDate = new Date(`${today}T00:00:00Z`);
tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
const tomorrow = tomorrowDate.toISOString().slice(0, 10);
const yesterdayDate = new Date(`${today}T00:00:00Z`);
yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
const yesterday = yesterdayDate.toISOString().slice(0, 10);

beforeEach(() => {
  pool.query.mockReset();
});

describe("authentication", () => {
  test("registration stores a bcrypt hash, not the submitted password", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: userId, name: "Test User", email: "test@example.com" }],
      });

    const response = await request(app).post("/api/auth/register").send({
      name: "Test User",
      email: "TEST@example.com",
      password: "A-strong-password",
    });

    expect(response.status).toBe(201);
    const storedHash = pool.query.mock.calls[1][1][2];
    expect(storedHash).not.toBe("A-strong-password");
    await expect(bcrypt.compare("A-strong-password", storedHash)).resolves.toBe(
      true,
    );
  });
});

describe("reading endpoints", () => {
  test("requires a glucose value and returns the specified message", async () => {
    const response = await request(app)
      .post("/api/readings")
      .set("Authorization", authorization)
      .send({ reading_date: today, time_slot: "Morning", value: "" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Please enter a glucose value.");
    expect(pool.query).not.toHaveBeenCalled();
  });

  test.each([39, 601, 100.5])(
    "rejects glucose value %s",
    async (value) => {
      const response = await request(app)
        .post("/api/readings")
        .set("Authorization", authorization)
        .send({ reading_date: today, time_slot: "Morning", value });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        "Value must be between 40 and 600 mg/dl.",
      );
      expect(pool.query).not.toHaveBeenCalled();
    },
  );

  test("rejects a future reading date", async () => {
    const response = await request(app)
      .post("/api/readings")
      .set("Authorization", authorization)
      .send({ reading_date: tomorrow, time_slot: "Morning", value: 120 });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Date cannot be in the future.");
    expect(pool.query).not.toHaveBeenCalled();
  });

  test("creates a valid reading for the authenticated user", async () => {
    const reading = {
      id: 8,
      reading_date: today,
      time_slot: "Morning",
      value: 115,
    };
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [reading] });

    const response = await request(app)
      .post("/api/readings")
      .set("Authorization", authorization)
      .send({ reading_date: today, time_slot: "Morning", value: 115 });

    expect(response.status).toBe(201);
    expect(response.body.reading).toMatchObject(reading);
    expect(pool.query.mock.calls[1][1]).toEqual([userId, today, "Morning", 115]);
  });

  test("accepts the displayed fasting label and stores the canonical slot", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 9,
            reading_date: today,
            time_slot: "Morning",
            value: 110,
          },
        ],
      });

    const response = await request(app)
      .post("/api/readings")
      .set("Authorization", authorization)
      .send({
        reading_date: today,
        time_slot: "Morning (fasting)",
        value: 110,
      });

    expect(response.status).toBe(201);
    expect(pool.query.mock.calls[1][1]).toEqual([userId, today, "Morning", 110]);
  });

  test("prevents a duplicate time slot on the same day", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ time_slot: "After lunch" }],
    });

    const response = await request(app)
      .post("/api/readings")
      .set("Authorization", authorization)
      .send({
        reading_date: today,
        time_slot: "After lunch",
        value: 120,
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      "You already have an After lunch reading for this date.",
    );
  });

  test("limits a user to four readings in one day", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { time_slot: "Morning" },
        { time_slot: "After breakfast" },
        { time_slot: "After lunch" },
        { time_slot: "After dinner" },
      ],
    });

    const response = await request(app)
      .post("/api/readings")
      .set("Authorization", authorization)
      .send({
        reading_date: today,
        time_slot: "Morning",
        value: 120,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "You can add only 4 readings per day.",
    );
  });

  test("scopes the readings list to the authenticated user", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 5,
          reading_date: "2026-11-15",
          time_slot: "After breakfast",
          value: 100,
        },
      ],
    });

    const response = await request(app)
      .get("/api/readings")
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.readings[0].reading_date).toBe("2026-11-15");
    const query = pool.query.mock.calls[0][0];
    expect(query).toContain("WHERE user_id = $1");
    expect(query).toContain("reading_date::text AS reading_date");
    expect(pool.query).toHaveBeenCalledWith(query, [userId]);
  });

  test("does not update a reading owned by another user", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .put("/api/readings/999")
      .set("Authorization", authorization)
      .send({ reading_date: today, time_slot: "Morning", value: 120 });

    expect(response.status).toBe(404);
    expect(pool.query.mock.calls[0][1]).toEqual([999, userId]);
  });

  test("allows changing a reading's value without reapplying the daily limit", async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 8,
            reading_date: yesterday,
            time_slot: "After breakfast",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 8,
            reading_date: yesterday,
            time_slot: "After breakfast",
            value: 135,
          },
        ],
      });

    const response = await request(app)
      .put("/api/readings/8")
      .set("Authorization", authorization)
      .send({
        reading_date: yesterday,
        time_slot: "After breakfast",
        value: 135,
      });

    expect(response.status).toBe(200);
    expect(response.body.reading.value).toBe(135);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  test("still enforces the daily limit when moving a reading to a full day", async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 8,
            reading_date: yesterday,
            time_slot: "After breakfast",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 1, time_slot: "Morning" },
          { id: 2, time_slot: "After breakfast" },
          { id: 3, time_slot: "After lunch" },
          { id: 4, time_slot: "After dinner" },
        ],
      });

    const response = await request(app)
      .put("/api/readings/8")
      .set("Authorization", authorization)
      .send({ reading_date: today, time_slot: "Morning", value: 135 });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "You can add only 4 readings per day.",
    );
  });

  test("returns daily statistics and readings", async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{ count: 2, highest: 150, lowest: 100, average: "125.0" }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 1, time_slot: "Morning", value: 100 },
          { id: 2, time_slot: "After breakfast", value: 150 },
        ],
      });

    const response = await request(app)
      .get("/api/readings/reports/daily")
      .query({ date: today })
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.report).toEqual({
      date: today,
      highest: 150,
      lowest: 100,
      average: 125,
      count: 2,
    });
    expect(response.body.readings).toHaveLength(2);
    expect(pool.query.mock.calls[0][1]).toEqual([userId, today]);
  });

  test("calculates the full previous month, including its last day", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ count: 0, highest: null, lowest: null, average: null }],
    });

    const response = await request(app)
      .get("/api/readings/reports/monthly")
      .query({ date: "2026-03-15" })
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.report).toMatchObject({
      start_date: "2026-02-01",
      end_date: "2026-02-28",
      count: 0,
    });
    expect(pool.query.mock.calls[0][1]).toEqual([
      userId,
      "2026-02-01",
      "2026-02-28",
    ]);
  });
});

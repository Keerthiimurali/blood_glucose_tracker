import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import api from "../api";
import "./Dashboard.css";

const TIME_SLOTS = [
  { value: "Morning", label: "Morning (fasting)" },
  { value: "After breakfast", label: "After breakfast" },
  { value: "After lunch", label: "After lunch" },
  { value: "After dinner", label: "After dinner" },
];

function getLocalDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).formatToParts(new Date());
  const date = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${date.year}-${date.month}-${date.day}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function ReportCard({ title, range, report }) {
  const hasReadings = report && report.count > 0;

  return (
    <section className="dashboard-card report-card">
      <div className="report-heading">
        <h2>{title}</h2>
        <span>{range}</span>
      </div>
      {hasReadings ? (
        <dl className="report-stats">
          <div>
            <dt>Highest</dt>
            <dd>{report.highest} mg/dl</dd>
          </div>
          <div>
            <dt>Lowest</dt>
            <dd>{report.lowest} mg/dl</dd>
          </div>
          <div>
            <dt>Average</dt>
            <dd>{Number(report.average).toFixed(1)} mg/dl</dd>
          </div>
          <div>
            <dt>Readings</dt>
            <dd>{report.count}</dd>
          </div>
        </dl>
      ) : (
        <p className="empty-state">No readings for this period yet.</p>
      )}
    </section>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const user = getStoredUser();

  const today = getLocalDate();
  const [selectedDate, setSelectedDate] = useState(today);
  const [readings, setReadings] = useState([]);
  const [reports, setReports] = useState({
    daily: null,
    monthToDate: null,
    monthly: null,
  });
  const [formData, setFormData] = useState({
    reading_date: today,
    time_slot: TIME_SLOTS[0].value,
    value: "",
  });
  const [editingId, setEditingId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadingReadings, setLoadingReadings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!token) return undefined;

    let cancelled = false;

    api.get("/readings")
      .then((response) => {
        if (cancelled) return;
        setReadings(response.data.readings);
        setError("");
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          requestError.response?.data?.message ||
            "Could not load your readings. Please try again.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingReadings(false);
      });

    Promise.all([
      api.get("/readings/reports/daily", { params: { date: selectedDate } }),
      api.get("/readings/reports/month-to-date", {
        params: { date: selectedDate },
      }),
      api.get("/readings/reports/monthly", { params: { date: selectedDate } }),
    ])
      .then(([daily, monthToDate, monthly]) => {
        if (cancelled) return;
        setReports({
          daily: daily.data.report,
          monthToDate: monthToDate.data.report,
          monthly: monthly.data.report,
        });
        setReportError("");
      })
      .catch((requestError) => {
        if (cancelled) return;
        setReportError(
          requestError.response?.data?.message ||
            "Could not load reports. Please try again.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [token, selectedDate, refreshKey]);

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      reading_date: selectedDate,
      time_slot: TIME_SLOTS[0].value,
      value: "",
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (formData.value === "") {
      setError("Please enter a glucose value.");
      return;
    }

    const glucoseValue = Number(formData.value);
    if (
      !Number.isInteger(glucoseValue) ||
      glucoseValue < 40 ||
      glucoseValue > 600
    ) {
      setError("Value must be between 40 and 600 mg/dl.");
      return;
    }

    if (!formData.reading_date) {
      setError("Please select a date.");
      return;
    }

    if (formData.reading_date > today) {
      setError("Date cannot be in the future.");
      return;
    }

    setSaving(true);

    const payload = {
      ...formData,
      value: glucoseValue,
    };

    try {
      if (editingId) {
        await api.put(`/readings/${editingId}`, payload);
        setSuccessMessage("Glucose reading updated.");
      } else {
        await api.post("/readings", payload);
        setSuccessMessage("Glucose reading added.");
      }

      setEditingId(null);
      setSelectedDate(payload.reading_date);
      setFormData({
        reading_date: payload.reading_date,
        time_slot: TIME_SLOTS[0].value,
        value: "",
      });
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not save your reading. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (reading) => {
    setError("");
    setSuccessMessage("");
    setEditingId(reading.id);
    setFormData({
      reading_date: String(reading.reading_date).slice(0, 10),
      time_slot: reading.time_slot,
      value: String(reading.value),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (readingId) => {
    if (!window.confirm("Delete this glucose reading?")) return;

    setError("");
    setSuccessMessage("");
    try {
      await api.delete(`/readings/${readingId}`);
      setSuccessMessage("Glucose reading deleted.");
      if (editingId === readingId) resetForm();
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not delete your reading. Please try again.",
      );
    }
  };

  const dailyReadings = readings.filter(
    (reading) => String(reading.reading_date).slice(0, 10) === selectedDate,
  );

  return (
    <div className="dashboard-container">
      <nav className="dashboard-navbar">
        <a className="brand" href="/dashboard" aria-label="Sweety dashboard">
          Sweety
        </a>
        <button className="logout-button" onClick={handleLogout} type="button">
          Log out
        </button>
      </nav>

      <main className="dashboard-content">
        <header className="dashboard-welcome">
          <p className="eyebrow">YOUR HEALTH JOURNAL</p>
          <h1>Welcome, {user.name || "User"}!</h1>
          <p>Keep track of your blood glucose readings and trends.</p>
        </header>

        {error && <div className="notice error-notice" role="alert">{error}</div>}
        {successMessage && (
          <div className="notice success-notice" role="status">
            {successMessage}
          </div>
        )}

        <section className="dashboard-card reading-form-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{editingId ? "UPDATE ENTRY" : "NEW ENTRY"}</p>
              <h2>{editingId ? "Edit reading" : "Add a reading"}</h2>
            </div>
            <p className="helper-text">Record up to four readings per day.</p>
          </div>

          <form className="reading-form" onSubmit={handleSubmit} noValidate>
            <label>
              Date
              <input
                type="date"
                name="reading_date"
                value={formData.reading_date}
                max={today}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Time slot
              <select
                name="time_slot"
                value={formData.time_slot}
                onChange={handleChange}
                required
              >
                {TIME_SLOTS.map((slot) => (
                  <option key={slot.value} value={slot.value}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Glucose value (mg/dl)
              <input
                type="number"
                name="value"
                min="40"
                max="600"
                step="1"
                inputMode="numeric"
                placeholder="e.g. 110"
                value={formData.value}
                onChange={handleChange}
                required
              />
            </label>
            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Add reading"}
              </button>
              {editingId && (
                <button className="secondary-button" type="button" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="reports-section">
          <div className="section-heading reports-title">
            <div>
              <p className="eyebrow">YOUR REPORTS</p>
              <h2>Glucose summaries</h2>
            </div>
            <label className="report-date">
              Report date
              <input
                type="date"
                value={selectedDate}
                max={today}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </label>
          </div>
          {reportError && (
            <div className="notice error-notice" role="alert">{reportError}</div>
          )}
          <div className="reports-grid">
            <ReportCard
              title="Daily"
              range={formatDate(selectedDate)}
              report={reports.daily}
            />
            <ReportCard
              title="Month to date"
              range={
                reports.monthToDate
                  ? `${formatDate(reports.monthToDate.start_date)} – ${formatDate(reports.monthToDate.end_date)}`
                  : "This month"
              }
              report={reports.monthToDate}
            />
            <ReportCard
              title="Previous month"
              range={
                reports.monthly
                  ? `${formatDate(reports.monthly.start_date)} – ${formatDate(reports.monthly.end_date)}`
                  : "Previous month"
              }
              report={reports.monthly}
            />
          </div>
        </section>

        <section className="dashboard-card readings-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">READING HISTORY</p>
              <h2>Daily readings</h2>
            </div>
            <label className="report-date">
              Selected day
              <input
                type="date"
                value={selectedDate}
                max={today}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </label>
          </div>

          {loadingReadings ? (
            <p className="empty-state">Loading your readings...</p>
          ) : dailyReadings.length === 0 ? (
            <p className="empty-state">
              No readings for {formatDate(selectedDate)}. Add one above to get started.
            </p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Time slot</th>
                    <th>Value</th>
                    <th className="actions-heading">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyReadings.map((reading) => (
                    <tr key={reading.id}>
                      <td>
                        {reading.time_slot === "Morning"
                          ? "Morning (fasting)"
                          : reading.time_slot}
                      </td>
                      <td className="reading-value">{reading.value} <span>mg/dl</span></td>
                      <td className="row-actions">
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => handleEdit(reading)}
                        >
                          Edit
                        </button>
                        <button
                          className="text-button delete-button"
                          type="button"
                          onClick={() => handleDelete(reading.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default Dashboard;

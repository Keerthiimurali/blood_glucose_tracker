# Sweety – Blood Glucose Tracker

Sweety is a small React and Node.js/Express app backed by PostgreSQL. Users can
create an account, record up to four glucose readings per day, edit or delete
their readings, and view daily, month-to-date, and previous-month reports.

## Requirements

- Node.js 20.19+ or 22.12+
- PostgreSQL
- npm

## Install and configure

1. Create a PostgreSQL database named `sweety_glucose`. For example, in `psql`:

   ```sql
   CREATE DATABASE sweety_glucose;
   ```

2. From the project root, copy the example environment file and edit the
   database password and JWT secret:

   ```powershell
   if (-not (Test-Path server\.env)) { Copy-Item .env.example server\.env }
   if (-not (Test-Path client\.env)) {
     Set-Content client\.env 'VITE_API_URL=http://localhost:5000/api'
   }
   ```

   `server/.env` needs `PORT`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
   `DB_PASSWORD`, and `JWT_SECRET`. The Vite client reads `VITE_API_URL` from
   `client/.env`. Use a long, random `JWT_SECRET`; do not commit either `.env`
   file.

3. Install dependencies and initialize the database:

   ```powershell
   cd server
   npm ci
   npm run db:setup
   npm run db:seed
   ```

   `db:setup` creates the tables and constraints. `db:seed` creates or refreshes
   the demo account and its sample readings.

## Run the app

Start the API in a terminal:

```powershell
cd server
npm run dev
```

In a second terminal, start the React client:

```powershell
cd client
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). The API
defaults to `http://localhost:5000`.

### Demo account

- Email: `demo@sweety.local`
- Password: `SweetyDemo123!`

This account is for local demonstration only. Do not use the demo password for
a real account.

## Tests and checks

Run the API tests:

```powershell
cd server
npm test -- --runInBand
```

Run the frontend lint and production build:

```powershell
cd client
npm run lint
npm run build
```

The API tests mock PostgreSQL for deterministic route and validation coverage.
The database setup and seed scripts can be run separately against the configured
PostgreSQL database.

## Required behavior

- Passwords are stored as bcrypt hashes. Protected reading and report endpoints
  use the authenticated user's ID.
- A reading must be a whole number from 40 to 600 mg/dl, use one of the four
  supported time slots, and have a date that is not in the future.
- A user may have only one reading per slot per day. The database enforces the
  unique slot rule as well as the value and slot constraints.
- Daily reports include the selected day's readings. Month-to-date reports cover
  the first day of the selected month through that date. Monthly reports cover
  the entire previous calendar month.
- Empty report periods show a friendly no-readings message.

## API routes

- `POST /api/auth/register` and `POST /api/auth/login`
- `GET /api/readings`, `POST /api/readings`
- `PUT /api/readings/:id`, `DELETE /api/readings/:id`
- `GET /api/readings/reports/daily?date=YYYY-MM-DD`
- `GET /api/readings/reports/month-to-date?date=YYYY-MM-DD`
- `GET /api/readings/reports/monthly?date=YYYY-MM-DD`

Reading and report routes require an `Authorization: Bearer <token>` header.

## Notes

### Assumptions

- Calendar dates and the future-date check use the `Asia/Kolkata` timezone.
- The report date is selected by the user; month-to-date and previous-month
  ranges are calculated from that date.
- A demo seed run intentionally sets the demo account password to the documented
  local-only value and upserts sample readings.

### Improvements with more time

- Add frontend component tests and end-to-end tests against a disposable
  PostgreSQL database.
- Add pagination for long reading histories, deployment configuration, and
  production-grade session handling and rate limiting.
- Add charts for glucose trends and improve accessibility across the UI.

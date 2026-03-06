# SafeSense Engineering Handover Complete Documentation

> **Target Audience:** New incoming engineers taking full ownership of the SafeSense repository, product, and infrastructure.

## 1. Executive Overview
SafeSense is an IoT platform designed to ingest sensor data (temperature, humidity), process it against predefined thresholds, and alert users via email, push notifications, and a dashboard. 

The application architecture is highly non-standard because it heavily relies on PostgreSQL triggers for core core computational logic (alerting, state transitions) while bridging two distinct authentication paradigms (a legacy Supabase Auth implementation alongside a custom Next.js/JWT system).

## 2. Product/Domain Context
- **Primary Value Proposition:** Real-time visibility into environmental metrics for compliance (e.g., FDA/HACCP temperature logs) and preventing asset spoilage, with guaranteed alerting if thresholds are crossed.
- **Hardware Integration:** Edge ESP32 sensors send readings to the cloud using MQTT. If the devices lose Wi-Fi, they buffer historical data. The Next.js API handles this using a specific `replay` flag to backfill historical time-series data without triggering outdated realtime alerts.
- **Tenancy & Sharing:** Users can group sensors (`SensorGroup`) and invite other users (`TeamInvitation`) to view specific groups, allowing facility managers to share view-only access with staff.

---

## 3. System Architecture with End-to-End Flow
**Sensor to Alert Flow:**
1. **Edge (ESP32):** Reads temperature `F` and publishes an MQTT JSON payload. 
    *   *Reference:* ESP32 configuration details are embedded as documentation inside `src/app/api/chat/route.js`. The default topic is `safesense/sensors`. 
2. **Ingestion Worker (UNKNOWN):** Data lands in the Postgres table `public.mqtt_consumer_test`. 
    *   *CRITICAL GAP:* Our repository does not contain the code that subscribes to the MQTT broker and writes to `mqtt_consumer_test`. This is likely an external Telegraf instance, a Mosquitto bridge, or a missing Node/Python worker deployed directly on the host server.
3. **Trigger Logic (PostgreSQL):** An `AFTER INSERT` trigger (`sync_sensor_trigger` defined in `scripts/sync-mqtt-to-sensors.sql`) fires, updating the `public.sensors` table with `latest_temp` and calculating the `status` (`ok`, `warning`, `alert`).
4. **Alert Generation (PostgreSQL):** A second set of triggers (`scripts/setup-sensor-status-triggers.sql`) monitors updates to `public.sensors`. If a sensor crosses an alert threshold, it logs an entry in `public.sensor_alert_log` and prepares notifications.
5. **Frontend UI (Next.js):** The `src/app/dashboard/page.js` view polls standard REST endpoints (`GET /api/sensors`) to display live data visualizations.

---

## 4. Repository / Codebase Tour
| Directory/File | Purpose | Key Details |
| --- | --- | --- |
| `src/app/` | Next.js App Router | UI views (`dashboard`, `history`, `teams`) and backend endpoints (`api/`). |
| `src/app/api/` | Backend API Routes | Core application logic. Look at `api/sensors/[id]/readings/route.js` to see how the "replay" logic handles offline data vs live data. |
| `prisma/schema.prisma` | Database ORM | Defines the Postgres schema. **Note:** Includes both the `public` schema for app data and definitions for a vast Supabase `auth` schema. |
| `scripts/*.sql` & `*.js` | Core Business & Infra Logic | Contains raw SQL for triggers, Auth setup, and manual DB initialization. **This folder is as important as the Next.js code.** |
| `lib/` | Application Services | Contains `auth.js` for JWT logic, `database.js` for raw SQL interactions, and `otpService.js` for email verifications. |
| `docker-compose.yml` | Deployment Context | Configured to run the Next.js app on port `3000`. It points the database to a remote IP `161.97.170.64:5401`. |

---

## 5. Local Setup
1. **Prerequisites:** Node.js 20+, Docker (optional).
2. **Install:**
   ```bash
   npm install
   ```
3. **Environment Setup:** Create `.env.local`:
   ```env
   NODE_ENV=development
   DATABASE_URL=postgres://[user]:[pass]@161.97.170.64:5401/postgres # CAUTION: See notes below.
   JWT_SECRET=your-local-secret
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=safesencewinwinlabs@gmail.com
   SMTP_PASS=...
   SMTP_FROM=safesencewinwinlabs@gmail.com
   APP_BASE_URL=http://localhost:3000
   ```
4. **Database (DANGER):** The `DATABASE_URL` in `docker-compose.yml` points to what appears to be a shared staging/production database on a Coolify-managed VPS. 
    *   **NEVER run `npx prisma db push`** against this database. Prisma push will silently drop the critical custom SQL triggers in the `scripts/` folder because Prisma does not natively manage Postgres functions/triggers.
5. **Run Locally:**
   ```bash
   npm run dev
   ```

---

## 6. Runtime Config and Environments
- **Server Infrastructure:** The application is intended to run using Docker on a self-managed VPS. The `docker-compose.yml` points to an `APP_BASE_URL` using a `your-coolify-domain.com` placeholder. This strongly implies the outgoing team uses **Coolify** to orchestrate deployment.
- **Database:** Hosted at `161.97.170.64:5401/postgres`. **Operational Step needed Day 1:** SSH into this server to determine if the MQTT ingest worker is running natively alongside Postgres.

---

## 7. Data Model and Persistence
The application uses Prisma but spans two Postgres schemas:
1. **`auth` schema:** Migrated from a standard Supabase installation. Contains tables like `users`, `sessions`, `identities`.
2. **`public` schema:** The main app data (`sensors`, `devices`, `sensor_groups`, `sensor_alert_log`).

**High-Risk Area:** To accomplish authentication, the custom Next.js API in `lib/auth.js` executes raw SQL strings (`$executeRaw`) to query the Supabase `auth.users` table, checking `encrypted_password` directly with the `bcrypt` library.

---

## 8. Critical Internal APIs and Handlers
- **Authentication:** `POST /api/login` (`lib/auth.js`). Note that there are two signup flows: users who create a password directly vs SSO (Google) users who enter via `createAuthUserFromGoogle`.
- **Sensors:** `GET /api/sensors`. Note that the `dashboard` UI actually contains logic to manually force a sync (`/api/sync-sensors`) every 60 seconds as a fallback in case the PostgreSQL triggers fail.
- **AI Chatbot (High Cost Risk):** `POST /api/chat`. Connects to OpenAI. System prompts in `route.js` evaluate user intent regarding their sensor history and inject static documentation (like hardware setup guides) directly into the LLM context.

---

## 9. Automation and Background Tasks
*   **The Missing MQTT Worker:** As noted in section 3, something is inserting into `mqtt_consumer_test`. You must find this worker. If the dashboard stops updating, it is extremely likely this unknown worker has crashed, NOT the Next.js app.
*   **Postgres Triggers:** The heavy lifting is done by `sync_sensor_from_mqtt()` inside PostgreSQL. If this trigger is accidentally dropped, data will enter the database but the frontend dashboard statuses will never change.

---

## 10. Known Risks, Tech Debt, and Fragile Areas

### Risk 1: The Split-Brain Authentication Architecture (FRAGILE)
- **Why this matters:** The database utilizes a full Supabase `auth` schema, implying the system historically relied on Supabase Auth. However, `lib/auth.js` implements a custom JWT generator using raw `bcrypt` hashes. A new engineer assuming this is NextAuth or standard Supabase will break login. 

### Risk 2: Raw SQL Trigger Dependency (HIGH RISK)
- **Why this matters:** A standard `prisma migrate dev` or `prisma db push` does not track the raw SQL functions in the `scripts/` folder. If someone wipes the DB and applies Prisma migrations, the app will appear to start up, but all sensor status calculations and alerts will fail silently. 
- **Mitigation Check:** If someone drops the DB, you MUST manually run `node scripts/setup-sensor-sync.js` and `node scripts/run-sensor-triggers-setup.js` afterward.

### Risk 3: AI Chatbot Prompt Injection and Hallucinations
- **Why this matters:** The Chatbot reads the user's sensor data and offers advice based on the `AI_CHATBOT_IMPROVEMENTS.md` rules. If the OpenAI prompt is altered carelessly, the AI might hallucinate that an overheating freezer is actually "safe," introducing severe legal liability for food spoilage.

---

## 11. Troubleshooting Guide & Incident Response

### Incident: All sensors suddenly report "Offline" on the Dashboard
1.  **Check the API Logs:** Look at the Next.js logs. Is the `/api/sensors` route throwing 500s?
2.  **Verify PostgreSQL Triggers:** SSH to the DB, open `psql`, and type `\dt`. Verify `mqtt_consumer_test` exists. Type `\d mqtt_consumer_test` and verify `sync_sensor_trigger` is still attached to the table.
3.  **Find the MQTT Worker:** Ensure the external worker is actually publishing to Postgres.
4.  **Fallback Command:** Force sync the latest data manually by running:
    ```bash
    curl -X GET http://localhost:3000/api/sync-sensors
    # or inside psql:
    SELECT sync_all_recent_sensors();
    ```

### Incident: Users cannot log in; seeing "Invalid Credentials"
1.  **Check `lib/auth.js`:** The code explicitly checks `if (!isVerified && !hasPassword)`. Was an email confirmation bypassed?
2.  **Verify Token Secret:** Did someone change `JWT_SECRET` in `.env.local`? If so, all active user tokens instantly invalidated. 

---

## 12. Handoff Gaps / Output Questions for Outgoing Team (URGENT)
Before the outgoing engineers depart, you **MUST** get answers to the following:
1. **MQTT Worker Location:** "Where does the code run that subscribes to the `safesense/sensors` MQTT topic and inserts it into `mqtt_consumer_test`?"
2. **Coolify / Root Infrastructure Access:** "Need immediate admin access to the Coolify dashboard and the host running IP `161.97.170.64`."
3. **ESP32 Firmware Source:** "Where is the C++ / Arduino source code for the edge hardware devices?"
4. **External API Credentials:** Handover passwords for OpenAI (`OPENAI_API_KEY`) and the SendGrid/Gmail account (`safesencewinwinlabs@gmail.com`).

---

## Appendix A: Useful Operations Commands

**Re-apply core database logic:**
```bash
# If alerts stop working or status calculations are broken
node scripts/setup-auth-tables.js
node scripts/setup-sensor-sync.js
node scripts/run-sensor-triggers-setup.js
```

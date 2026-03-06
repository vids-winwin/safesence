# Engineering Handover Documentation Blueprint: Safesence

This document serves as the structural blueprint for creating the final engineering handover documentation. It identifies what needs to be documented, why it's critical, what is currently known from the codebase, and what must be extracted from the outgoing team before their departure.

## 1. Authentication & Authorization (High Risk Area)
- **Why it matters:** Critical path for user access, security, and tenant isolation. The codebase appears to use a complex, potentially hybrid authentication approach.
- **Evidence:** `src/app/api/auth`, `scripts/setup-auth-tables.js`, `prisma/schema.prisma` (Supabase Auth `users`, `identities`, `sessions` vs custom tables like `OtpCode`, `UserDevice`, `SignupPending`).
- **Files/Folders to Inspect:** `src/app/api/login`, `src/app/api/signup`, `lib/auth.js`, `lib/otpService.js`.
- **What is UNKNOWN:** Is Supabase Auth the intended source of truth, or is the custom OTP/Device fingerprinting system primary? How are the two synchronized? What is the role of `is_anonymous` vs authenticated states?
- **Questions for outgoing team:** What is the intended final state of authentication? Are there legacy auth flows still active that need deprecation? How do we handle device fingerprinting rollbacks if a user is locked out?
- **Risks if undocumented:** Broken login flows, security vulnerabilities through desynced user states, extreme difficulty debugging user access issues.

## 2. Sensor Data Pipeline & Realtime Trigger System (Fragile Area)
- **Why it matters:** This is the core engine of the application. Sensor data flows from MQTT into the database, where heavily customized SQL triggers handle alert generation outside of the standard Prisma ORM workflow.
- **Evidence:** `scripts/sync-mqtt-to-sensors.sql`, `scripts/setup-sensor-status-triggers.sql`, `prisma/schema.prisma` (models `mqtt_consumer`, `sensor_alert_log`, `Sensor`).
- **Files/Folders to Inspect:** `scripts/` (especially all `.sql` files), `src/app/api/sensors`, `src/app/api/sync-sensors`.
- **What is UNKNOWN:** Which external MQTT broker is used? How does the Postgres database ingest the MQTT stream (is it a Postgres extension or a separate worker)? How are schema migrations managed given the reliance on raw SQL triggers alongside Prisma?
- **Questions for outgoing team:** Where is the MQTT broker configured and hosted? What are the runbooks for when the `mqtt_consumer` stops receiving events? How are database migrations managed without destroying the raw SQL triggers?
- **Risks if undocumented:** Silent data loss if MQTT disconnects. Alerts failing to fire if SQL triggers are accidentally dropped during a standard Prisma migration.

## 3. Hardware Integration (ESP32) & Provisioning
- **Why it matters:** Software teams cannot support a product if they do not understand how the edge hardware behaves in the field.
- **Evidence:** `ESP32_REPLAY_FIELD.md`, `scripts/run-replay-migration.js`, `scripts/add-replay-field.sql`.
- **Files/Folders to Inspect:** `src/app/api/devices`, `lib/deviceService.js`.
- **What is UNKNOWN:** How are ESP32 devices provisioned for new customers? What firmware version are they running, and where is the firmware source code? How are OTA (Over-The-Air) updates managed?
- **Questions for outgoing team:** Provide the physical provisioning runbook. What happens when a device loses Wi-Fi? How does the "replay field" functionality recover offline data, and what are its limits?
- **Risks if undocumented:** Inability to onboard new customers if hardware provisioning is tribal knowledge. Devices bricking without recovery mechanisms.

## 4. AI Chatbot & Services Interaction
- **Why it matters:** Generative AI features integrate tightly with internal data and external APIs, representing both UX value and financial cost.
- **Evidence:** `AI_CHATBOT_IMPROVEMENTS.md`, `AI_CHATBOT_SETUP.md`, `src/app/api/chat`.
- **Files/Folders to Inspect:** `src/app/api/chat`, OpenAI dependencies in `package.json`.
- **What is UNKNOWN:** What application context is fed into the AI models? Are there prompt injection protections? What is the cost-monitoring strategy for OpenAI?
- **Questions for outgoing team:** How is the system prompt managed? Are there any vector databases or RAG pipelines not captured in the Prisma schema?
- **Risks if undocumented:** Ballooning API costs, hallucinations presenting false sensor danger/safety to users, prompt injection vulnerabilities.

## 5. Operations, Deployment & Environments
- **Why it matters:** Incident response heavily relies on proper documentation of deployments, environments, and restarts.
- **Evidence:** `IMPORTANT_RESTART.md`, `RESTART_SERVER.md`, `docker-compose.yml`, `Dockerfile`, standard Next.js README.
- **Files/Folders to Inspect:** `package.json` scripts, `Dockerfile`, CI/CD pipelines (if they exist in `.github` or on Vercel).
- **What is UNKNOWN:** Is the production environment hosted on Vercel, or is it self-hosted using the provided Dockerfile? Where is the database actually hosted (Supabase vs custom Postgres)?
- **Questions for outgoing team:** Confirm the exact production hosting infrastructure. Where are logs piped to? What are the escalation policies? Handover checklist for root credentials to Vercel/Supabase/Sendgrid/OpenAI.
- **Risks if undocumented:** Extended downtime because the new team restarts the wrong environment, destroys data, or lacks root access to key infrastructure.

---

## Major Business-Critical Workflows Requiring Deep Dives
1. **Device Onboarding Flow:** The end-to-end journey of an ESP32 device going from factory to reporting data on a user's dashboard.
2. **Alert Generation Flow:** How a spike in temperature/humidity travels from the sensor -> MQTT -> `sensor_status` trigger -> `sensor_alert_log` -> SendGrid email/Push notification.
3. **Team/Sensor Group Invites:** How users are invited to view specific sensor data via `TeamInvitation` and `SensorGroupMember`, considering tenant isolation.

## Missing Elements (To be Authored)
- **Missing Tests:** The `package.json` lacks testing scripts (Jest/Cypress/Playwright). A testing strategy document must be created, and we must confirm if any tests exist outside this repo.
- **Missing Diagrams:** Architecture diagram mapping Sensor -> MQTT Broker -> Postgres Trigger -> Next.js Application.
- **Missing Runbooks:** Specifically, a database migration runbook explaining how to safely run `prisma migrate` without overwriting the custom database functions mapped in the `scripts/` folder.

---

## Proposed Final Documentation Table of Contents
1. **System Overview** (Architecture, Repositories, Tech Stack)
2. **Infrastructure & Deployment** (Hosting, Docker, Environment Variables, CI/CD)
3. **Hardware & Firmware** (ESP32 Provisioning, Replay Field Logic, MQTT Broker Config)
4. **Data Layer** (Prisma Schema, Raw SQL Triggers, Data Sync pipelines)
5. **Authentication Pipelines** (Dual Auth flow: Supabase & custom OTP/Device Auth)
6. **Key Workflows** (Sensor Ingestion, Alert Generation, Team Sharing)
7. **External Integrations** (OpenAI, SendGrid, Supabase, Email Templates)
8. **Runbooks & Troubleshooting** (Restarting servers, fixing desynced sensors, alert failures)

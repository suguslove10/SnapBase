# SnapBase

SnapBase is an open source database backup platform for teams that want scheduled backups, restore workflows, storage control, alerts, and a CLI in one product.

It includes a Next.js dashboard, a Go API server, a Go CLI, PostgreSQL metadata storage, and S3-compatible object storage through MinIO or external providers.

## Features

- Automated backups for PostgreSQL, MySQL, MongoDB, and SQLite
- Cron-based schedules with retention controls
- Manual backup triggers from the dashboard or CLI
- Download and restore flows for completed backups
- S3-compatible storage providers, including MinIO, AWS S3, Cloudflare R2, Backblaze B2, and Wasabi-style endpoints
- AES-256-GCM encryption for stored credentials and optional encrypted backup artifacts
- Backup verification, anomaly detection, and restore status tracking
- Email, Slack, Discord, and webhook notifications
- Organization workspaces, invites, roles, and connection-level permissions
- Database sync jobs for production-to-staging style workflows
- Audit logs, status checks, usage reporting, and billing hooks
- Optional AI schema insights using OpenAI
- Browser-authenticated CLI for backup operations from the terminal

## Repository Structure

```text
.
├── backend/          # Go API, scheduler, backup runner, restore logic, billing, webhooks
├── frontend/         # Next.js dashboard and public pages
├── cli/              # Go CLI powered by Cobra
├── docker-compose.yml
└── .env.example
```

## Tech Stack

- Backend: Go 1.22, Gin, PostgreSQL, MinIO SDK, robfig/cron
- Frontend: Next.js 14, React 18, TypeScript, Tailwind CSS, shadcn-style components
- CLI: Go 1.22, Cobra
- Storage: MinIO locally; S3-compatible providers in production
- Billing: Razorpay integration hooks
- AI insights: OpenAI API, optional

## Prerequisites

For the Docker setup:

- Docker and Docker Compose

For local development without Docker:

- Go 1.22+
- Node.js 20+
- PostgreSQL 16+
- MinIO or another S3-compatible bucket
- Database client tools used by the backup runner:
  - `pg_dump` and `psql` for PostgreSQL
  - `mysqldump` and `mysql` for MySQL
  - `mongodump` and `mongorestore` for MongoDB
  - `sqlite3` for SQLite

## Quick Start

1. Clone the repository.

```bash
git clone https://github.com/suguslove10/SnapBase.git
cd SnapBase
```

2. Create your environment file.

```bash
cp .env.example .env
```

3. Set production-quality secrets before running anything public.

```bash
openssl rand -hex 16
```

Use the generated 32-character value for `ENCRYPTION_KEY`, and set a strong `JWT_SECRET`.

4. Start the full stack.

```bash
docker compose up --build
```

5. Open the app.

- Dashboard: http://localhost:3001
- API: http://localhost:8080
- MinIO API: http://localhost:9000
- MinIO console: http://localhost:9001

The backend seeds a local admin account on first boot:

```text
Email: admin@snapbase.local
Password: admin123
```

Change this immediately if you expose the app outside local development.

## Environment Variables

Core configuration:

| Variable | Purpose |
| --- | --- |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL metadata database credentials |
| `JWT_SECRET` | JWT signing secret |
| `ENCRYPTION_KEY` | 32-byte key used for AES encryption of stored secrets |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` | Default object storage settings |
| `FRONTEND_URL` | Public frontend URL used for OAuth, reset links, and CORS |

Optional integrations:

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` | Email delivery |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth |
| `RAZORPAY_*` | Billing, subscriptions, invoices, and storage add-ons |
| `OPENAI_API_KEY` | AI schema insights |

See [.env.example](.env.example) for the full list.

## Local Development

Start dependencies with Docker:

```bash
docker compose up postgres minio
```

Run the backend:

```bash
cd backend
go run .
```

Run the frontend:

```bash
cd frontend
npm install
npm run dev
```

By default, the frontend expects the API at `http://localhost:8080/api`. Set `NEXT_PUBLIC_API_URL` if your backend runs somewhere else.

Build the CLI:

```bash
cd cli
make build
./dist/snapbase --help
```

For local CLI testing against a local backend:

```bash
SNAPBASE_API_URL=http://localhost:8080/api ./dist/snapbase login
```

## CLI Usage

Install from a release:

```bash
curl -fsSL https://getsnapbase.com/install | bash
```

Common commands:

```bash
snapbase login
snapbase connections list
snapbase schedules list
snapbase backup list
snapbase backup run <connection-name>
snapbase restore <backup-id>
snapbase status
snapbase logout
```

The CLI stores credentials in `~/.snapbase/config.json`.

## API Overview

Public endpoints include:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/providers`
- `GET /api/status`
- `GET /api/cli/auth/init`
- `GET /api/cli/auth/poll/:token`
- `POST /api/billing/webhook`

Authenticated API areas include:

- `/api/connections`
- `/api/backups`
- `/api/schedules`
- `/api/storage-providers`
- `/api/settings`
- `/api/anomalies`
- `/api/audit`
- `/api/reports`
- `/api/billing`
- `/api/storage-addons`
- `/api/org`
- `/api/sync`
- `/api/webhooks`
- `/api/insights`

## Storage

SnapBase stores backup artifacts in object storage. The local Docker setup uses MinIO and creates a default storage provider. In production, configure your preferred S3-compatible provider from the dashboard or through environment-backed defaults.

Backups are written under paths like:

```text
<user-id>/<connection-id>/<timestamp>.<extension>
```

Encrypted backups are stored with an additional `.enc` suffix.

## Security Notes

- `ENCRYPTION_KEY` must be exactly 32 bytes.
- Database credentials are encrypted before storage.
- Optional per-connection backup encryption derives a backup key from the user's password.
- Lost backup encryption passwords cannot be recovered.
- Do not commit real OAuth, SMTP, storage, Razorpay, or OpenAI credentials.
- Rotate any secret that has ever been committed to a public repository.
- Replace the seeded local admin credentials before any non-local deployment.

## Production Notes

Before deploying SnapBase publicly:

- Set strong `JWT_SECRET` and `ENCRYPTION_KEY` values.
- Configure HTTPS and a production `FRONTEND_URL`.
- Use managed PostgreSQL or a backed-up PostgreSQL instance for metadata.
- Use durable S3-compatible storage for backup artifacts.
- Install database dump and restore tools in the backend runtime image.
- Configure SMTP or webhook notifications for failed backup alerts.
- Disable or replace the default seeded admin account.
- Set `APP_ENV=production` to tighten allowed CORS origins.
- Add Razorpay and OAuth credentials only if those features are enabled.

## Contributing

Contributions are welcome. A good first workflow is:

```bash
git checkout -b fix-or-feature-name
```

Then make the change, run the relevant checks, and open a pull request with:

- What changed
- Why it changed
- How it was tested
- Any migration or configuration notes

## Development Checks

Backend:

```bash
cd backend
go test ./...
```

CLI:

```bash
cd cli
go test ./...
make build
```

Frontend:

```bash
cd frontend
npm install
npm run lint
npm run build
```

## License

No license file is currently included in this repository. If you intend SnapBase to be open source, add a license such as MIT, Apache-2.0, or AGPL-3.0 so contributors and users know their rights.

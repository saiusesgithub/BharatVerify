Frontend — Blockchain-Verified Certificates (MVP)

Overview

- Stack: Vite + React + TypeScript, React Router, Zustand, TailwindCSS.
- Features: Auth with role guards, Admin Upload + Audit, Verifier Verify + Audit, responsive UI, dark mode.
- Tests: Playwright smoke tests.

Quick Start

- Prereqs: Node 20+, npm, backend running at http://localhost:3000.
- Setup: `cp .env.example .env` (adjust if needed).
- Dev: `npm install` then `npm run dev` (opens on http://localhost:5173).
- Build: `npm run build` then `npm run preview`.

Environment

- `VITE_API_BASE_URL` (default: http://localhost:3000)

Routes

- `/login`
- `/admin/upload`, `/admin/audit` (ADMIN)
- `/verifier/verify`, `/verifier/audit` (VERIFIER)

Docker

- Build: `docker build -t certs-frontend .`
- Run: `docker run --rm -p 8080:80 certs-frontend` → open http://localhost:8080

Tests

- `npm run test` (Playwright) — requires the dev server at http://localhost:5173 and backend at http://localhost:3000.

Creds

- ADMIN: admin@example.com / Pass@123
- VERIFIER: verifier@example.com / Pass@123


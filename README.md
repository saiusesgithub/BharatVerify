Blockchain-Verified Certificates — Backend MVP

Overview

- Stack: Node.js 20, TypeScript, Fastify, Prisma (SQLite), JWT auth.
- Adapters (mocked): BlockchainAdapter, CloudStorageAdapter, KeyRegistry.
- Features: Admin upload with signing, Verifier verify with PASS/FAIL reasons, audit logs, OpenAPI at /docs.
- One-command run via Docker Compose. Seeded demo data and keys included.

Quick Start

- Prereqs: Docker + Docker Compose.
- Start: `docker compose up --build` (builds, applies schema, seeds, runs tests, then starts server).
- Stop: `docker compose down -v` (removes containers and volumes).
- Health: GET http://localhost:3000/health
- OpenAPI: http://localhost:3000/docs

Seeded Accounts

- ADMIN: email `admin@example.com`, password `Pass@123`
- VERIFIER: email `verifier@example.com`, password `Pass@123`

Main Flows

- Login: POST `/api/auth/login` { email, password } -> JWT
- Admin Upload (ADMIN): POST `/api/admin/certificates/upload` multipart fields:
  - `file` (binary)
  - `meta` (JSON string with minimal metadata)
- Verify (VERIFIER): POST `/api/verifications/verify` { docId } -> PASS/FAIL + reasons
- Audit List (both roles): GET `/api/audit?limit=20&offset=0` (your own actions)

Acceptance Tests (mocked adapters)

1) Start stack.
2) Login as ADMIN -> upload `demo/transcript.pdf` -> receive created certificate with `docId`.
3) Login as VERIFIER -> verify same `docId` -> receive `status=PASS`.
4) Tamper: replace file contents locally then verify again -> `status=FAIL` with `HASH_MISMATCH`.

Adapter Behavior (Mocks)

- BlockchainAdapter: stores a deterministic chain record in DB table `ChainRecord` and logs payloads.
- CloudStorageAdapter (mock): stores files under `data/files/` and returns a `local://files/<name>` URL.
- CloudStorageAdapter (Cloudflare R2): when `USE_MOCK_ADAPTERS=false`, uploads to R2 via S3 API and returns `r2://<bucket>/<key>`.
- KeyRegistry: resolves issuer public key from DB; seeded issuer has an Ed25519 keypair.

Scripts

- `npm run dev`: hot-reload (local dev without Docker).
- `npm run build`: TypeScript build.
- `npm run start`: start compiled server.
- `npm run test`: unit + integration tests (vitest).
- `npm run migrate`: apply schema (Prisma db push for dev).
- `npm run seed`: seed demo data.
- `npm run ci:local`: format, lint, build, prisma generate, migrate, test, start.

Docker

- `docker compose up --build` runs install, build, prisma generate, schema push, seed, tests, and then starts server at 3000.

Config

- `.env` controls runtime flags:
  - `PORT=3000`
  - `JWT_SECRET=dev_jwt_secret_change_me`
  - `USE_MOCK_ADAPTERS=true`
  - `STORAGE_DIR=/app/data/files`
  - `DATABASE_URL=file:./dev.db`
  - For Cloudflare R2 (set these and set `USE_MOCK_ADAPTERS=false`):
    - `R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxx`
    - `R2_ACCESS_KEY_ID=AKIA...`
    - `R2_SECRET_ACCESS_KEY=...`
    - `R2_BUCKET=your-bucket-name`

Cloudflare R2 Notes

- R2 is S3-compatible. This service uses the endpoint `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` with path-style addressing and region `auto`.
- The returned `fileUrl` is `r2://<bucket>/<key>` for internal reference; downloads for verification are performed server-side using the R2 API.
- If your bucket is public or fronted by a CDN, you may also map `r2://` to a public HTTPS URL externally; not required for backend verification.

Project Structure

```
.
├─ src/
│  ├─ api/
│  │  ├─ authController.ts
│  │  ├─ certificateController.ts
│  │  ├─ verificationController.ts
│  │  └─ auditController.ts
│  ├─ services/
│  │  ├─ certificateService.ts
│  │  ├─ verificationService.ts
│  │  └─ auditService.ts
│  ├─ domain/
│  │  ├─ entities.ts
│  │  └─ dto.ts
│  ├─ adapters/
│  │  ├─ blockchainAdapter.ts
│  │  ├─ cloudStorageAdapter.ts
│  │  └─ keyRegistry.ts
│  ├─ infra/
│  │  ├─ http/server.ts
│  │  ├─ db/prismaClient.ts
│  │  ├─ auth/auth.ts
│  │  └─ logging.ts
│  ├─ utils/
│  │  ├─ crypto.ts
│  │  ├─ errors.ts
│  │  └─ validation.ts
│  └─ index.ts
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts
├─ tests/
│  ├─ unit/
│  │  ├─ crypto.spec.ts
│  │  └─ auth.spec.ts
│  └─ integration/
│     └─ endtoend.spec.ts
├─ demo/
│  ├─ transcript.pdf
│  └─ transcript_tampered.pdf
├─ .devcontainer/devcontainer.json
├─ docker-compose.yml
├─ Dockerfile
├─ package.json
├─ tsconfig.json
├─ vitest.config.ts
├─ .eslintrc.cjs
├─ .prettierrc
├─ .env
└─ postman/collection.json
```

Error Catalog (codes)

- AUTH_INVALID: invalid credentials or token
- FORBIDDEN: role not permitted
- CERT_NOT_FOUND: certificate not found
- HASH_MISMATCH: recomputed file hash differs from stored/chain
- SIG_INVALID: signature verification failed
- CHAIN_MISS: chain record not found or inconsistent

Postman

- Import `postman/collection.json` and use the seeded creds. Environment variables are not required; target `http://localhost:3000`.

Notes

- This MVP signs and verifies the SHA-256 hash of the file bytes using Ed25519 keys. Keys are demo-only and stored in DB (do not do this in production). Adapters are cleanly abstracted for future real implementations.

Dev Handy Commands (PowerShell)

Login and capture token

```
$resp = curl.exe -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{ "email":"admin@example.com","password":"Pass@123" }'
$token = ($resp | ConvertFrom-Json).token
```

Find recent uploads and a docId

```
$aud = curl.exe -s -H "Authorization: Bearer $token" "http://localhost:3000/api/audit?limit=10"
($aud | ConvertFrom-Json).items | Select-Object createdAt,action,refId
$docId = ( ($aud | ConvertFrom-Json).items | Where-Object {$_.action -eq "UPLOAD"} | Select-Object -First 1 ).refId
```

Get certificate details

```
$obj = (curl.exe -s -H "Authorization: Bearer $token" "http://localhost:3000/api/certs/$docId" | ConvertFrom-Json)
$obj.signatureHex; $obj.issuerAddress; $obj.sha256Hex
```

Chain-adapter health and queries

```
curl.exe -s http://localhost:8088/health
curl.exe -s "http://localhost:8088/verify?docId=$docId"
```

Mark issuer active in registry (on-chain)

```
$body = @{ address = "0xbBFA201f773090C8532c6c00181b8b0915D91cFD"; name = "Demo Issuer" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:8088/issuer/add" -ContentType "application/json" -Body $body
curl.exe -s "http://localhost:8088/issuer/is-active?address=0xbBFA201f773090C8532c6c00181b8b0915D91cFD"
```

Optional: verify signature via adapter

```
$vs = @{ docId=$docId; sha256Hex=$obj.sha256Hex; issuedAtUnix=$obj.issuedAt; signatureHex=$obj.signatureHex; expectedIssuer=$obj.issuerAddress } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:8088/verify-signature" -ContentType "application/json" -Body $vs
```


## Email Notifications

A full setup and troubleshooting guide lives in [docs/EMAIL_NOTIFICATIONS.md](docs/EMAIL_NOTIFICATIONS.md). It covers Gmail SMTP, provider fallbacks (SendGrid/Mailgun/SES), dev testing via /api/dev/notify/test, and the automatic emails triggered on issuance, verification, adapter failures, and revocations.

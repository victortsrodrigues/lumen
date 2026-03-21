# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Church ERP system — a fullstack web application for church management with a complete authentication and security foundation, plus a full Members module with LGPD compliance.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, shadcn/ui, Tailwind CSS, wouter, React Query, framer-motion
- **Forms**: react-hook-form + @hookform/resolvers
- **CSV parsing**: papaparse
- **Object storage**: Replit Object Storage (`@google-cloud/storage`)
- **Encryption**: Node.js `crypto` module (AES-256-GCM)

## Applications

### Church ERP (`artifacts/church-erp`)
- React + Vite frontend at `/` (port 20845 in dev)
- Login, register, forgot-password, reset-password pages
- MFA verify and setup pages for admin role
- Dashboard with sidebar layout
- Audit logs page (admin only)
- Members module: list, create, edit, profile, CSV import
- Dark/light theme support

### API Server (`artifacts/api-server`)
- Express 5 backend at `/api`
- Auth routes: `/api/auth/{register,login,logout,me,csrf,forgot-password,reset-password,mfa/setup,mfa/verify}`
- Audit routes: `/api/audit/logs` (admin only)
- Members routes: `/api/members` (CRUD + CSV import + CPF reveal)
- Utils routes: `/api/utils/cep/:cep` (ViaCEP lookup)
- Storage routes: `/api/storage/uploads/request-url`, `/api/storage/objects/*`, `/api/storage/public-objects/*`

## Security Architecture

- JWT in HttpOnly cookie (`auth_token`), 1 hour expiry
- CSRF tokens (HMAC-based, 30-min expiry) required on all state-changing forms
- bcrypt hashing (cost factor 12) for passwords
- Rate limiting: max 5 login attempts/minute per IP, 15-min block
- Session timeout: 30 min inactivity (25 min warning)
- Security headers on all responses: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- MFA (TOTP via speakeasy) mandatory for admin role, optional setup flow

## LGPD Compliance

- CPF encrypted with AES-256-GCM (`cpfEncrypted`); SHA-256 hash in `cpfHash` for search
- CPF masked in listings as `***.***.***-XX`; full CPF only via POST `/members/:id/cpf/reveal` (admin only, audit logged)
- Phone, address zip/street/neighborhood also AES-256-GCM encrypted
- LGPD consent checkbox required for every member creation/CSV import; stored in `consent_records`
- Encryption key: `FIELD_ENCRYPTION_KEY` env var (set in production secrets)

## User Roles

- **admin**: Full access + mandatory MFA + audit logs + CPF reveal + member delete
- **leader**: Standard access, no audit logs, can create/edit members
- **member**: Limited access (own profile only)

## Database Tables

- `users` — auth credentials, role, MFA secret/backup codes, reset tokens
- `audit_logs` — **APPEND-ONLY** immutable event trail (no UPDATE/DELETE)
- `consent_records` — LGPD/privacy consent tracking
- `members` — Member profiles (encrypted CPF/phone/address fields)
- `member_history` — **APPEND-ONLY** change history (tracks all field changes with before/after diff)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express 5 API server
│   │   └── src/
│   │       ├── lib/        # jwt.ts, csrf.ts, audit.ts, rateLimit.ts, logger.ts, crypto.ts, objectStorage.ts, objectAcl.ts
│   │       ├── middlewares/ # auth.ts, security.ts
│   │       └── routes/     # health.ts, auth.ts, audit.ts, members.ts, utils.ts, storage.ts
│   └── church-erp/         # React + Vite frontend
│       └── src/
│           ├── components/layout/  # Sidebar, Header, AppLayout, AuthLayout
│           ├── hooks/              # use-auth-context.tsx
│           └── pages/
│               ├── members/        # index.tsx, new.tsx, [id]/index.tsx, [id]/edit.tsx, import.tsx
│               │   └── components/ # MemberForm.tsx
│               └── ...             # login, register, dashboard, audit-logs, etc.
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
│       └── src/schema/     # users.ts, audit_logs.ts, consent_records.ts, members.ts, member_history.ts
└── scripts/                # Utility scripts
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push schema changes to the database

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-provided by Replit)
- `JWT_SECRET` — Secret for JWT signing (set in production secrets)
- `CSRF_SECRET` — Secret for CSRF token HMAC (set in production secrets)
- `FIELD_ENCRYPTION_KEY` — AES-256-GCM key for encrypting CPF/phone/address (set in production secrets)
- `PORT` — Server port (auto-assigned by Replit)
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` — Replit Object Storage bucket ID
- `PRIVATE_OBJECT_DIR` — Base path for private object storage
- `PUBLIC_OBJECT_SEARCH_PATHS` — Paths for public object search

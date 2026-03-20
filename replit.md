# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Church ERP system — a fullstack web application for church management with a complete authentication and security foundation.

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

## Applications

### Church ERP (`artifacts/church-erp`)
- React + Vite frontend at `/` (port 20845 in dev)
- Login, register, forgot-password, reset-password pages
- MFA verify and setup pages for admin role
- Dashboard with sidebar layout
- Audit logs page (admin only)
- Dark/light theme support

### API Server (`artifacts/api-server`)
- Express 5 backend at `/api`
- Auth routes: `/api/auth/{register,login,logout,me,csrf,forgot-password,reset-password,mfa/setup,mfa/verify}`
- Audit routes: `/api/audit/logs` (admin only)

## Security Architecture

- JWT in HttpOnly cookie (`auth_token`), 1 hour expiry
- CSRF tokens (HMAC-based, 30-min expiry) required on all state-changing forms
- bcrypt hashing (cost factor 12) for passwords
- Rate limiting: max 5 login attempts/minute per IP, 15-min block
- Session timeout: 30 min inactivity (25 min warning)
- Security headers on all responses: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- MFA (TOTP via speakeasy) mandatory for admin role, optional setup flow

## User Roles

- **admin**: Full access + mandatory MFA + audit logs
- **leader**: Standard access, no audit logs
- **member**: Limited access

## Database Tables

- `users` — auth credentials, role, MFA secret/backup codes, reset tokens
- `audit_logs` — **APPEND-ONLY** immutable event trail (no UPDATE/DELETE)
- `consent_records` — LGPD/privacy consent tracking

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express 5 API server
│   │   └── src/
│   │       ├── lib/        # jwt.ts, csrf.ts, audit.ts, rateLimit.ts, logger.ts
│   │       ├── middlewares/ # auth.ts, security.ts
│   │       └── routes/     # health.ts, auth.ts, audit.ts
│   └── church-erp/         # React + Vite frontend
│       └── src/
│           ├── components/layout/  # Sidebar, Header, AppLayout, AuthLayout
│           ├── hooks/              # use-auth-context.tsx
│           └── pages/             # login, register, dashboard, audit-logs, etc.
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
│       └── src/schema/     # users.ts, audit_logs.ts, consent_records.ts
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
- `PORT` — Server port (auto-assigned by Replit)

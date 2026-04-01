# Backend Implementation Plan — InvenTrack

| Field            | Detail                                                         |
| ---------------- | -------------------------------------------------------------- |
| **Document Version** | 1.0                                                        |
| **Date**         | 2026-04-01                                                     |
| **Parent Docs**  | BRD.md, BACKEND_BRD.md, BACKEND_TECH_SPEC.md                  |
| **Status**       | Draft                                                          |

---

## Table of Contents

1. [Implementation Overview](#1-implementation-overview)
2. [Pre-Development Setup](#2-pre-development-setup)
3. [Phase 1 Milestones](#3-phase-1-milestones)
4. [Phase 2 Milestones](#4-phase-2-milestones)
5. [Phase 3 Milestones](#5-phase-3-milestones)
6. [Phase 4 Milestones](#6-phase-4-milestones)
7. [Critical Implementation Notes](#7-critical-implementation-notes)
8. [Testing Checkpoints](#8-testing-checkpoints)
9. [Go-Live Checklist](#9-go-live-checklist)

---

## 1. Implementation Overview

### 1.1 Phase Summary

| Phase | Milestones | Focus | Depends On |
| ----- | ---------- | ----- | ---------- |
| **Setup** | M0 | Infrastructure, project scaffold, DB schema, seeds | Nothing |
| **Phase 1** | M1–M7 | Auth, Products, POS billing, Purchases, Suppliers, Customers, Cash Register, Dashboard | M0 |
| **Phase 2** | M8–M11 | POs, GST/Reports, Expenses, Stock audit, Audit log | Phase 1 |
| **Phase 3** | M12–M14 | Offline sync, Returns, Notifications, Held bills | Phase 2 |
| **Phase 4** | M15 | SaaS multi-tenant onboarding, Super admin | Phase 3 |

### 1.2 Build Order Rationale

The milestones are ordered by **dependency chain**, not by perceived importance:

1. **Auth + Tenant + Users first** — every other endpoint requires authentication and tenant scoping
2. **Categories/Brands/Sizes next** — products depend on them
3. **Products next** — billing, stock, purchases, and labels all depend on products
4. **Billing (POS) immediately after products** — this is the most critical feature; the sooner it works, the sooner the store can operate
5. **Purchases after billing** — purchases create stock entries (like billing) and update average cost
6. **Suppliers/Customers around billing and purchases** — credit tracking depends on ledger entries from bills and purchases
7. **Cash register alongside billing** — billing creates cash register entries
8. **Dashboard last in Phase 1** — it aggregates data from everything above

---

## 2. Pre-Development Setup (M0)

**Goal:** A developer can clone the repo, run one command, and have a working API server connected to PostgreSQL, Redis, and MinIO.

### 2.1 Tasks

| # | Task | Output |
|---|------|--------|
| 1 | Initialize monorepo with `apps/api/` folder structure (as defined in Backend Tech Spec Section 2) | Project scaffold |
| 2 | Set up `package.json` with all dependencies: hono, drizzle-orm, drizzle-kit, pg, zod, bcrypt, jose (JWT), bullmq, ioredis, @aws-sdk/client-s3, bwip-js, decimal.js, pino, vitest, supertest, @testcontainers/postgresql | Installable project |
| 3 | Create `docker-compose.yml` with PostgreSQL 16, Redis 7, MinIO services | `docker compose up` works |
| 4 | Create `.env.example` with all env vars (DATABASE_URL, REDIS_URL, JWT_SECRET, S3_*, SMTP_*) | Config template |
| 5 | Set up `src/config/env.ts` — Zod-validated environment variables | Env fails fast on missing vars |
| 6 | Set up `src/config/database.ts` — PostgreSQL connection pool (max 20 connections) | DB client |
| 7 | Set up `src/config/redis.ts` — ioredis client | Redis client |
| 8 | Set up `src/config/s3.ts` — S3 client (pointing to MinIO locally) | S3 client |
| 9 | Write all Drizzle schema files in `src/db/schema/` for **all** tables (even Phase 2+ tables). Schema is cheap — having all tables from day one avoids migration pain later | Complete DB schema |
| 10 | Generate and run initial migration: `npx drizzle-kit generate && npx drizzle-kit migrate` | All tables created |
| 11 | Create `src/db/seed/defaults.ts` with 16 default categories, 6 size systems, 7 expense categories | Seed data ready |
| 12 | Create `src/db/seed/dev-seed.ts` with test tenant, test users (owner, manager, salesperson), sample products | Dev data ready |
| 13 | Set up Hono app entry point (`src/index.ts`, `src/server.ts`) with health check endpoint (`GET /health`) | Server starts, health check passes |
| 14 | Create `src/lib/errors.ts` — custom error classes: `AppError`, `ValidationError`, `NotFoundError`, `ForbiddenError`, `AuthError` | Error types |
| 15 | Create `src/lib/response.ts` — standard response helpers matching API envelope: `success(data, meta?)`, `error(code, message, details?)`, `paginated(data, cursor, hasMore)` | Response helpers |
| 16 | Create `src/lib/money.ts` — decimal.js helpers: `decimalSum()`, `toDbDecimal()`, `roundTo2()` | Money math utils |
| 17 | Create `src/lib/gst-calculator.ts` — GST back-calculation (Regular + Composition) using decimal.js | GST calculator |
| 18 | Create `src/lib/date-utils.ts` — `getCurrentFinancialYear()`, `getQuarter()` | Date helpers |
| 19 | Create `src/lib/indian-format.ts` — Indian number formatting | Format helper |
| 20 | Set up `src/middleware/error-handler.ts` — global catch-all, formats AppError subclasses into API envelope | Error handling works |
| 21 | Set up `src/middleware/request-id.ts` — generates `X-Request-Id` header | Request tracing |
| 22 | Set up Vitest config, first test: `gst-calculator.test.ts` — unit tests for GST back-calculation | Test pipeline works |
| 23 | Set up ESLint, Prettier, Husky + lint-staged | Code quality gates |
| 24 | Set up GitHub Actions CI: lint → typecheck → test on PR | CI pipeline |
| 25 | Create `Dockerfile` (multi-stage: build + run) | Container ready |

### 2.2 Definition of Done

- [ ] `docker compose up` starts all services
- [ ] `npm run dev` starts the API, `GET /health` returns `{"status": "healthy"}`
- [ ] Migrations create all tables in PostgreSQL
- [ ] `npm test` runs and passes GST calculator tests
- [ ] CI pipeline passes on a PR

---

## 3. Phase 1 Milestones

### M1: Authentication & Tenant Setup

**Goal:** Users can sign up, log in, and access the setup wizard. JWT auth protects all subsequent endpoints.

**Depends on:** M0

| # | Task | Service/File | Endpoints |
|---|------|-------------|-----------|
| 1 | Implement `auth.service.ts`: login (bcrypt verify), token generation (jose), refresh token rotation, password reset | auth.service | — |
| 2 | Implement `tenant.service.ts`: create tenant + owner user, seed default categories/sizes/brands, setup wizard completion | tenant.service | — |
| 3 | Implement `src/middleware/auth.ts`: JWT verification, extract `userId`, `tenantId`, `role` into Hono context | middleware | — |
| 4 | Implement `src/middleware/tenant-scope.ts`: verify tenant status is `active` | middleware | — |
| 5 | Implement `src/middleware/rbac.ts`: `requireRole()` guard | middleware | — |
| 6 | Implement `src/middleware/validate.ts`: Zod schema validation wrapper | middleware | — |
| 7 | Implement `src/middleware/rate-limit.ts`: Redis sliding window for login (5/min/IP) and general API (100/sec/tenant) | middleware | — |
| 8 | Wire up auth routes | auth.routes | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/me` |
| 9 | Wire up setup routes | setup.routes | `POST /setup/tenant`, `PUT /setup/wizard` |
| 10 | Wire up settings routes | settings.routes | `GET /settings`, `PATCH /settings`, `GET /settings/store`, `PATCH /settings/store` |
| 11 | Wire up user routes | users.routes | `GET /users`, `POST /users`, `GET /users/:id`, `PATCH /users/:id`, `POST /users/:id/reset-password` |

**Tests required:**
- Unit: JWT generation/verification, password hashing
- Integration: full login flow → access token → access protected endpoint → refresh → re-access
- Integration: tenant creation seeds default data
- Integration: RBAC — salesperson blocked from settings endpoints
- Integration: tenant isolation — user from tenant A gets 404 on tenant B data

**Definition of Done:**
- [ ] Login returns JWT + sets refresh cookie
- [ ] Protected endpoints reject unauthenticated requests (401)
- [ ] Role guard blocks unauthorized access (403)
- [ ] Tenant creation seeds 16 categories, 6 size systems
- [ ] Setup wizard marks `tenant.setup_complete = true`

---

### M2: Categories, Brands, Sizes & Product Catalog

**Goal:** Owner/Manager can configure product metadata and create/manage products. Products are searchable by barcode, SKU, and name.

**Depends on:** M1

| # | Task | Service/File | Endpoints |
|---|------|-------------|-----------|
| 1 | Implement category, sub-type, size system, brand CRUD in respective services | category.service, etc. | 13 endpoints (see Backend BRD Section 5.4) |
| 2 | Implement `product.service.ts`: CRUD, soft-delete (is_active=false), barcode generation (bwip-js) | product.service | `POST/GET/PUT/DELETE /products`, `GET /products/:id`, `POST /products/:id/barcode` |
| 3 | Implement `GET /products/search` — trigram search on name, exact match on barcode/SKU. Must return < 500ms. Index: `GIN (name gin_trgm_ops)` | product.service | `GET /products/search` |
| 4 | Add `updated_after` query parameter to `GET /products` — accepts ISO timestamp, returns only products where `updated_at > ?`. This enables the frontend's incremental catalog sync (see Frontend Tech Spec Section 10.2) to pull only changed products every 5 minutes instead of the full 2,000+ SKU catalog every time, reducing server load and mobile data usage | product.service | Modified `GET /products` |
| 5 | Implement bulk import: `POST /products/import` queues a BullMQ job, `GET /products/import/:jobId/status` returns progress | import.service, bulk-import.job | 2 endpoints |
| 6 | Implement `barcode.service.ts`: generate Code-128 SVG/PNG using bwip-js | barcode.service | — |
| 7 | Wire up label endpoints | label.service | `POST /labels/generate`, `GET /labels/templates` |
| 8 | Implement field-level filtering: strip `costPrice` from responses when `role = salesperson` | product.service | — |

**Tests required:**
- Integration: create product → appears in search by name, barcode, and SKU
- Integration: soft-delete → product excluded from list/search but still fetchable by ID
- Integration: bulk import — upload CSV → products created → job status returns `completed`
- Integration: salesperson GET /products/:id does NOT include costPrice
- Unit: barcode generation produces valid Code-128

**Definition of Done:**
- [ ] Full product CRUD works with all fields
- [ ] POS search returns results in < 500ms (verify with timing assertion)
- [ ] Bulk import processes a 100-row CSV successfully
- [ ] Barcode SVG generated for each product
- [ ] Labels PDF generated with barcode, name, size, price

---

### M3: Stock Service

**Goal:** Stock tracking works — stock entries are created, the `current_stock` trigger maintains the product column, and stock overview/history endpoints work.

**Depends on:** M2

| # | Task | Service/File | Endpoints |
|---|------|-------------|-----------|
| 1 | Verify the `trg_stock_entry_update_product` trigger works correctly — insert a stock entry, check `products.current_stock` updates | DB trigger verification | — |
| 2 | Implement `stock.service.ts`: stock overview (join products + current_stock), single product stock, movement history | stock.service | `GET /stock`, `GET /stock/:productId`, `GET /stock/:productId/history` |
| 3 | Implement opening stock entry support (for setup wizard / data migration): `type = 'opening'` | stock.service | Reuse `POST /purchases` or dedicated internal method |

**Tests required:**
- Integration: insert positive stock entry → `products.current_stock` increments
- Integration: insert negative stock entry → `products.current_stock` decrements (can go negative)
- Integration: stock overview returns correct quantities with status (healthy/low/out)

**Definition of Done:**
- [ ] Database trigger proven to work (test creates entries and reads current_stock)
- [ ] Stock overview returns all products with current stock, correct low/out status
- [ ] Movement history shows chronological entries for a product

---

### M4: POS Billing (Most Critical Milestone)

**Goal:** A salesperson can create a bill — the core revenue-generating operation. This is the most complex and important milestone.

**Depends on:** M2, M3

| # | Task | Service/File | Endpoints |
|---|------|-------------|-----------|
| 1 | Implement `bill-number.service.ts`: gap-free sequential numbers via `bill_sequences` table with `INSERT ON CONFLICT DO UPDATE RETURNING` | bill-number.service | — |
| 2 | Implement `billing.service.ts`: the 13-step atomic transaction (see Backend Tech Spec Section 7.1). **Critical: do NOT write this as a single monolithic function.** Build modular helper functions that each accept the Drizzle `tx` transaction object: `validateDiscountLimits(tx, ...)`, `computeLineItems(tx, ...)`, `insertBillItems(tx, ...)`, `decrementStock(tx, ...)`, `recordCustomerCredit(tx, ...)`, `recordCashRegisterEntry(tx, ...)`. The main `createBill()` function orchestrates these helpers inside a single `db.transaction()` call. This keeps the transaction atomic while making each step independently testable and maintainable | billing.service | — |
| 3 | Implement idempotency guard: catch PostgreSQL unique_violation (23505) on `client_id`, return existing bill | billing.service | — |
| 4 | Implement `GET /bills/:id/print` — return print-ready bill data, adapted for Regular (Tax Invoice with GST breakup) vs Composition (Bill of Supply, no GST, mandatory declaration text) | billing.service | `GET /bills/:id/print` |
| 5 | Wire up bill routes | bills.routes | `POST /bills`, `GET /bills`, `GET /bills/:id`, `GET /bills/:id/print` |

**Tests required (mandatory before proceeding):**
- Integration: create bill with cash payment → verify bill, bill_items, bill_payments, stock_entries all created atomically
- Integration: create bill with split payment (cash + UPI) → verify both payments recorded
- Integration: create bill with credit payment → verify customer ledger entry + outstanding_balance updated
- Integration: salesperson exceeds discount limit → gets `DISCOUNT_LIMIT_EXCEEDED` error
- Integration: payment doesn't balance net_amount → gets `PAYMENT_UNBALANCED` error
- Integration: credit payment without customer → gets validation error
- Integration: concurrent bill creation → bill numbers are gap-free (run 10 concurrent calls)
- Integration: idempotency — POST same `client_id` twice → returns same bill, no duplicate
- Integration: bill with negative stock result → stock goes negative, no error
- Unit: GST back-calculation for 5% and 12% rates with decimal.js precision check
- Unit: bill number formatting: `KVB-2026-00001`

**Definition of Done:**
- [ ] Full billing flow works end-to-end
- [ ] All 11 tests above pass
- [ ] Print endpoint returns correct format for both GST schemes
- [ ] Concurrent billing under load doesn't produce duplicates or gaps

---

### M5: Purchases & Average Cost

**Goal:** Owner/Manager can record goods receipts (direct purchases). Inventory increases and average cost recalculates correctly.

**Depends on:** M3, M4 (uses same ledger and stock patterns)

| # | Task | Service/File | Endpoints |
|---|------|-------------|-----------|
| 1 | Implement `purchase.service.ts`: atomic transaction — purchase + items + stock entries + avg cost update + supplier ledger entry. Include zero-stock guard for avg cost | purchase.service | — |
| 2 | Implement ITC tracking for Regular GST scheme (CGST, SGST, IGST amounts stored on purchase) | purchase.service | — |
| 3 | Implement Composition scheme handling: GST absorbed into cost_price, no ITC | purchase.service | — |
| 4 | Wire up purchase routes | purchases.routes | `POST /purchases`, `GET /purchases`, `GET /purchases/:id` |
| 5 | Implement presigned URL upload flow for supplier invoice images | uploads.routes | `POST /uploads/presign` |

**Tests required:**
- Integration: record purchase → stock increases, avg cost recalculates correctly
- Integration: purchase when current_stock = 0 → avg cost = purchase cost (no divide-by-zero)
- Integration: purchase when current_stock < 0 → avg cost = purchase cost
- Integration: Regular scheme purchase → ITC amounts stored
- Integration: Composition scheme purchase → GST absorbed into cost, no ITC
- Integration: supplier outstanding_balance increases after purchase

**Definition of Done:**
- [ ] Direct purchases record correctly with all stock and ledger side effects
- [ ] Average cost recalculation works for all stock states (positive, zero, negative)
- [ ] Presigned upload works (upload to MinIO locally)

---

### M6: Suppliers, Customers & Credit (Khata)

**Goal:** Full supplier and customer management with credit tracking (khata).

**Depends on:** M4, M5 (billing creates customer ledger entries, purchases create supplier ledger entries)

| # | Task | Service/File | Endpoints |
|---|------|-------------|-----------|
| 1 | Implement `supplier.service.ts`: CRUD, ledger query (window function for running balance), payment recording | supplier.service | 7 endpoints |
| 2 | Implement `customer.service.ts`: CRUD, khata ledger, payment recording, search by phone | customer.service | 7 endpoints |
| 3 | Implement `ledger.service.ts`: shared service for creating entries and atomically updating `outstanding_balance` on customer/supplier | ledger.service | — |
| 4 | Implement opening balance support: allow creating `opening_balance` ledger entries during data migration (no reference bill/purchase) | ledger.service | — |

**Tests required:**
- Integration: customer credit sale (from M4) → appears in customer ledger with correct debit
- Integration: record customer payment → ledger credit entry + outstanding_balance decreases
- Integration: supplier purchase (from M5) → appears in supplier ledger with correct debit
- Integration: record supplier payment → ledger credit entry + outstanding_balance decreases
- Integration: concurrent payments for same customer → outstanding_balance correct (atomic update)
- Integration: ledger running balance computed correctly via window function (3+ entries)
- Integration: opening balance entry → sets initial outstanding_balance

**Definition of Done:**
- [ ] Full supplier and customer CRUD
- [ ] Khata ledger shows correct running balance
- [ ] Payments correctly update outstanding balances
- [ ] Opening balances work for migration

---

### M7: Cash Register & Dashboard

**Goal:** Cash register tracking works. Dashboard aggregates all data into a single endpoint.

**Depends on:** M4, M5, M6

| # | Task | Service/File | Endpoints |
|---|------|-------------|-----------|
| 1 | Implement `cash-register.service.ts`: open (with opening balance), get current, get detail (with all entries), close (with counted cash + discrepancy calc), history | cash-register.service | 5 endpoints |
| 2 | Verify billing (M4) creates `cash_sale` register entries, and customer payment (M6) creates `credit_collection` entries | Integration check | — |
| 3 | Implement `dashboard.service.ts`: role-dependent aggregation. Owner/Manager: today's sales, profit, cash-in-hand, receivables, payables, low stock count, aging count, top sellers, recent bills, payments due. Salesperson: my sales, my register, my recent bills | dashboard.service | `GET /dashboard` |
| 4 | Implement Redis caching for dashboard (30-second TTL) with invalidation on bill creation and payment recording | dashboard.service + cache | — |

**Tests required:**
- Integration: open register → create bill (cash) → close register → discrepancy calculated correctly
- Integration: dashboard returns correct today's sales after creating a bill
- Integration: salesperson dashboard only shows own data

**Definition of Done:**
- [ ] Cash register open/close flow works with discrepancy detection
- [ ] Dashboard returns all widgets with correct data
- [ ] Dashboard cached in Redis, invalidated on bill/payment events

---

### Phase 1 Complete Checklist

Before proceeding to Phase 2, verify:

- [ ] All M1–M7 milestones pass their Definition of Done
- [ ] All 8 critical integration test scenarios from Backend Tech Spec Section 11.3 pass:
  1. Bill creation (all payment modes)
  2. Bill number sequence (concurrent, gap-free)
  3. Stock decrement (including negative)
  4. Purchase + avg cost (including zero-stock guard)
  5. Customer khata (credit → ledger → balance)
  6. Supplier payment (payment → ledger → balance)
  7. RBAC (salesperson restrictions)
  8. Tenant isolation
- [ ] API response times: product search < 500ms, bill creation < 1s
- [ ] `npm test` passes all unit + integration tests
- [ ] CI pipeline green
- [ ] Manual smoke test: create tenant → setup wizard → add product → create bill → view bill → record purchase → record customer payment → view dashboard

---

## 4. Phase 2 Milestones

### M8: Purchase Orders

**Depends on:** M5 (purchases), M6 (suppliers)

| # | Task | Endpoints |
|---|------|-----------|
| 1 | Implement PO CRUD: create, list, detail, update status, PDF generation (Puppeteer) | `GET/POST /purchase-orders`, `GET/PATCH /purchase-orders/:id`, `GET /purchase-orders/:id/pdf` |
| 2 | Link goods receipt to PO: update `received_qty` on PO items, auto-transition PO status | Modify `POST /purchases` |
| 3 | Implement purchase returns: return items to supplier, adjust stock and supplier balance | `POST /purchase-returns` |

**Definition of Done:**
- [ ] Full PO lifecycle: Draft → Sent → Partially Received → Received
- [ ] Purchase against PO updates received quantities
- [ ] Purchase returns reverse stock and supplier balance

---

### M9: Accounting — GST, Expenses, P&L

**Depends on:** M4 (bills), M5 (purchases), M8 (POs with ITC)

| # | Task | Endpoints |
|---|------|-----------|
| 1 | Implement GST dashboard: scheme-dependent. Regular: output tax, ITC, net liability. Composition: turnover + 1% tax | `GET /gst/summary` |
| 2 | Implement GST return data views: GSTR-1, GSTR-3B (Regular), CMP-08, GSTR-4 (Composition), ITC register, HSN summary | 6 GST endpoints |
| 3 | Implement expense CRUD + categories | 6 expense endpoints |
| 4 | Implement recurring expense background job (daily midnight) | `recurring-expense.job` |
| 5 | Implement P&L: revenue - COGS - expenses for date range | Included in reports |

**Definition of Done:**
- [ ] GST summary correct for both schemes
- [ ] ITC register matches purchases with GST (Regular only)
- [ ] Recurring expenses auto-created on schedule

---

### M10: Reports & Export

**Depends on:** M4–M9 (reports aggregate data from all modules)

| # | Task | Endpoints |
|---|------|-----------|
| 1 | Implement report query engine — 17 report types, each with date range filtering, pagination | `GET /reports/:type` |
| 2 | Implement report export: queue PDF/Excel generation as background job, store in S3, return download URL | `POST /reports/:type/export`, `GET /reports/export/:jobId` |
| 3 | Implement audit log endpoint | `GET /audit-log` |
| 4 | Implement audit log partition background job (monthly) | `audit-partition.job` |

**Report types to implement (in priority order):**
1. Daily Sales Summary
2. Sales by Category/Brand
3. Sales by Salesperson
4. Inventory Valuation
5. Low Stock
6. Outstanding Payables
7. Outstanding Receivables
8. Customer Ledger (Khata)
9. Supplier Ledger
10. Cash Register
11. P&L Statement
12. Purchase Summary
13. Expense Report
14. GST Summary
15. Bargain Discount Report
16. Aging Inventory
17. Dead Stock

**Definition of Done:**
- [ ] All 17 reports return correct data with date range filtering
- [ ] PDF/Excel export works (background job → S3 → download link)
- [ ] Audit log filterable by user, action, entity, date

---

### M11: Stock Adjustments & Audit

**Depends on:** M3 (stock service)

| # | Task | Endpoints |
|---|------|-----------|
| 1 | Implement stock adjustment: qty change + reason code → stock entry | `POST /stock/adjust` |
| 2 | Implement stock audit: submit physical count → variance report → approve adjustments | `POST /stock/audit`, `POST /stock/audit/approve` |
| 3 | Implement bill void: reverse stock entries, reverse ledger entries, update bill status | `POST /bills/:id/void` |

**Definition of Done:**
- [ ] Stock adjustment creates correct stock entry with reason
- [ ] Stock audit shows expected vs counted variance
- [ ] Bill void reverses all side effects atomically

---

## 5. Phase 3 Milestones

### M12: Offline Sync & Held Bills

**Depends on:** M4 (billing)

| # | Task | Endpoints |
|---|------|-----------|
| 1 | Implement `POST /bills/sync`: batch offline bill processing with idempotency (client_id), chronological ordering, soft-delete-safe product resolution | `POST /bills/sync` |
| 2 | Implement sync conflict handling: create SyncConflict records for hard failures | `GET /sync-conflicts`, `POST /sync-conflicts/:id/resolve`, `GET /sync-conflicts/count` |
| 3 | Implement held bills: save cart as draft bill, list, resume, discard | `POST /bills/hold`, `GET /bills/held`, `POST /bills/held/:id/resume`, `DELETE /bills/held/:id` |
| 4 | Implement stale held bills cleanup job (daily midnight, delete > 24h old) | `held-bills-cleanup.job` |

**Definition of Done:**
- [ ] Offline bills sync successfully, including those for archived products
- [ ] Duplicate client_id returns existing bill (idempotency)
- [ ] Sync conflicts created for genuinely invalid data
- [ ] Held bills persist and resume correctly

---

### M13: Returns & Exchanges

**Depends on:** M4 (billing, original bill data)

| # | Task | Endpoints |
|---|------|-----------|
| 1 | Implement return processing: always from original bill values, stock reversal, ledger entries | `POST /returns`, `GET /returns`, `GET /returns/:id` |
| 2 | Implement exchange flow: return items credited → new bill created → customer pays difference | Linked via `exchange_bill_id` |
| 3 | Implement return window enforcement with role-based override | Business rule in return.service |
| 4 | Implement credit note management | Part of return refund modes |

**Definition of Done:**
- [ ] Refund amounts always match original bill (never current price)
- [ ] Stock restored on return
- [ ] Return outside window blocked for salesperson, allowed for owner/manager

---

### M14: Notifications & Alerts

**Depends on:** M4–M11 (generates events that trigger notifications)

| # | Task | Endpoints |
|---|------|-----------|
| 1 | Implement notification CRUD | `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`, `GET /notifications/unread-count` |
| 2 | Implement OTP login (optional Phase 3 feature) | `POST /auth/verify-otp` |
| 3 | Implement background jobs: low stock check (hourly), supplier payment reminders (daily 9 AM), aging inventory digest (weekly Monday 8 AM), daily sales summary | 4 scheduled jobs |
| 4 | Implement custom label templates | `POST /labels/templates`, `PUT /labels/templates/:id` |

**Definition of Done:**
- [ ] Notifications created by background jobs and inline operations
- [ ] Unread count badge available for frontend polling
- [ ] All scheduled jobs run on their cron schedules

---

## 6. Phase 4 Milestones

### M15: SaaS & Super Admin

**Depends on:** Phase 1–3 complete

| # | Task | Endpoints |
|---|------|-----------|
| 1 | Implement self-service tenant signup: `POST /signup` → creates tenant + owner, sends welcome email | `POST /signup` (public) |
| 2 | Implement super admin routes (bypasses tenant scoping) | `GET /admin/dashboard`, `GET /admin/tenants`, `GET /admin/tenants/:id`, `PATCH /admin/tenants/:id` |
| 3 | Implement tenant suspension: reject writes, allow reads for data export | Middleware check |
| 4 | Implement tenant data export: background job → CSV per entity → ZIP → S3 | `POST /settings/export-data` |
| 5 | Implement rate limiting per subscription tier | Enhanced rate-limit middleware |

**Definition of Done:**
- [ ] New tenant can self-sign up and complete setup
- [ ] Super admin can view/suspend/activate tenants
- [ ] Suspended tenant can export data but not write

---

## 7. Critical Implementation Notes

These are reviewed gotchas from prior document reviews. Every developer must read this section before writing code.

### 7.1 Money Math — decimal.js Everywhere

**Rule:** JavaScript `number` must NEVER be used for multiplication, division, or subtraction involving money. Use `decimal.js` for all financial arithmetic. Use the `decimalSum()` and `toDbDecimal()` helpers from `src/lib/money.ts`.

**Where it applies:** GST back-calculation, bill totals, average cost, ledger debit/credit, refund amounts.

**Where native number is safe:** quantities (integers), percentages as stored values (not in arithmetic).

### 7.2 Stock — Trigger, Not Materialized View

`products.current_stock` is maintained by a database trigger on `stock_entries` insert. Do NOT use `REFRESH MATERIALIZED VIEW`. The trigger is O(1); a materialized view refresh is O(n) and will destroy POS latency under concurrent billing.

### 7.3 Products — Soft-Delete Only

`DELETE /products/:id` sets `is_active = false`. Never hard-delete. Archived products must remain queryable by ID/barcode for: offline sync resolution, historical bill reports, return processing.

### 7.4 Ledger — No Stored Running Balance

The `ledger_entries` table does NOT have a `running_balance` column. Compute it dynamically via:
```sql
SUM(debit - credit) OVER (ORDER BY created_at) AS running_balance
```
The denormalized `outstanding_balance` on Customer/Supplier is updated atomically: `SET outstanding_balance = outstanding_balance + ?`.

### 7.5 Average Cost — Zero-Stock Guard

When `current_stock <= 0`, set `new_avg_cost = purchase_cost`. Do NOT divide by zero or compute a weighted average on negative stock.

### 7.6 Idempotency — Catch PostgreSQL 23505

Do NOT use SELECT-then-INSERT for `client_id` idempotency. Let the database `UNIQUE` constraint enforce it. Catch PostgreSQL error code `23505` (unique_violation) on `bills_tenant_id_client_id_key`, then SELECT and return the existing bill.

### 7.7 Tenant Scoping — Every Query

Every SELECT, UPDATE, DELETE on a tenant-scoped table MUST include `WHERE tenant_id = ?`. Enforce via code review checklist. There is no application-level safety net other than discipline.

---

## 8. Testing Checkpoints

### 8.1 Per-Milestone Testing

Each milestone must pass its defined integration tests before the next milestone begins. Do not accumulate test debt.

### 8.2 Phase Gate Tests

Before releasing any phase, run the full test suite:

```bash
npm test                       # Unit + Integration
npm run test:e2e               # API E2E tests (supertest)
```

### 8.3 Load Testing (Before Go-Live)

Before deploying Phase 1 to production, run a simple load test simulating 3 concurrent POS stations:

| Scenario | Target |
|----------|--------|
| 3 concurrent `POST /bills` (5 items each) | All complete < 1 second, bill numbers gap-free |
| 10 concurrent `GET /products/search` | All return < 500ms |
| 1 `GET /dashboard` while 2 `POST /bills` run simultaneously | Dashboard returns < 2 seconds |

Tool: `k6` or `autocannon` — a simple script, not a full load testing infrastructure.

---

## 9. Go-Live Checklist

Before Kaushik Vastra Bhandar goes live on Phase 1:

### 9.1 Infrastructure

- [ ] Production PostgreSQL provisioned (managed — RDS/Neon/Supabase)
- [ ] Production Redis provisioned (ElastiCache/Upstash)
- [ ] Production S3 bucket created with presigned URL policy
- [ ] SSL/HTTPS configured (Cloudflare)
- [ ] Environment variables set in production
- [ ] Database backups configured (daily, 30-day retention)
- [ ] WAL archiving enabled for point-in-time recovery

### 9.2 Data

- [ ] Migrations run on production DB
- [ ] Kaushik's tenant created via setup wizard
- [ ] Owner, manager, salesperson accounts created
- [ ] Default categories, size systems seeded
- [ ] **Complete active product catalog imported and verified** — every product currently on the shelves must be in the system with correct SKU, barcode, size, and price. A POS system cannot go live with partial data. If a salesperson scans a shirt on day one and it's not in the system, trust in the software is lost. The owner must commit to full digitization before the counter switches over
- [ ] Opening stock entered (physical count for every imported product)
- [ ] Customer credit opening balances entered
- [ ] Supplier credit opening balances entered

### 9.3 Verification

- [ ] Full billing cycle tested: scan product → add to cart → apply discount → split payment → print receipt
- [ ] Direct purchase recorded → stock increased → avg cost updated
- [ ] Customer khata: credit sale → payment → balance correct
- [ ] Supplier payment → balance correct
- [ ] Cash register: open → bills → close → discrepancy check
- [ ] Dashboard shows correct numbers
- [ ] Barcode labels printed and scannable

### 9.4 Monitoring

- [ ] Health check endpoint monitored (uptime service)
- [ ] Structured logging (pino) writing to a log aggregator
- [ ] Error alerting configured (email/Slack on 5xx errors)
- [ ] Database query performance baseline recorded

---

*End of Document*

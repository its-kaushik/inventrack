# Frontend Implementation Plan — InvenTrack

| Field            | Detail                                                         |
| ---------------- | -------------------------------------------------------------- |
| **Document Version** | 1.0                                                        |
| **Date**         | 2026-04-01                                                     |
| **Parent Docs**  | FRONTEND_BRD.md, FRONTEND_TECH_SPEC.md, BACKEND_IMPLEMENTATION_PLAN.md |
| **Status**       | Draft                                                          |

---

## Table of Contents

1. [Implementation Overview](#1-implementation-overview)
2. [Pre-Development Setup (F0)](#2-pre-development-setup-f0)
3. [Phase 1 Milestones](#3-phase-1-milestones)
4. [Phase 2 Milestones](#4-phase-2-milestones)
5. [Phase 3 Milestones](#5-phase-3-milestones)
6. [Phase 4 Milestones](#6-phase-4-milestones)
7. [Backend Alignment & Parallelism](#7-backend-alignment--parallelism)
8. [Critical Implementation Notes](#8-critical-implementation-notes)
9. [Testing Checkpoints](#9-testing-checkpoints)
10. [Go-Live Checklist](#10-go-live-checklist)

---

## 1. Implementation Overview

### 1.1 Milestone Summary

| Milestone | Focus | Screens | Depends On (Backend) |
| --------- | ----- | ------- | -------------------- |
| **F0** | Scaffold, design tokens, shared components, stores, API client | 0 (infrastructure) | Nothing — runs in parallel with Backend M0 |
| **F1** | Auth, Setup Wizard, Settings | 8 | Backend M1 |
| **F2** | Product Catalog, Categories, Brands | 5 | Backend M2 |
| **F3** | Stock Overview, Labels | 2 | Backend M3 |
| **F4** | POS Billing (most critical) | 6 | Backend M4 (+ M2, M3) |
| **F5** | Purchases | 2 | Backend M5 |
| **F6** | Suppliers, Customers, Khata | 8 | Backend M6 |
| **F7** | Cash Register, Dashboard | 3 | Backend M7 |
| **F8** | POs, Expenses, GST, P&L, Reports, Audit | 17 | Backend M8–M11 |
| **F9** | Offline sync, Held bills, Returns, Notifications | 8 | Backend M12–M14 |
| **F10** | SaaS signup, Super admin | 7 | Backend M15 |

### 1.2 Build Order Rationale

1. **F0 first** — design tokens, shared components, API client, stores. Every screen depends on these. Runs in parallel with Backend M0 — frontend is never idle
2. **Auth before anything** — every screen requires login
3. **Products before POS** — POS searches and sells products
4. **POS immediately after products** — core revenue operation. POS UI + cart logic can be built against MSW mocks while waiting for Backend M4
5. **Suppliers/Customers alongside POS** — billing creates khata entries, so these screens validate end-to-end
6. **Dashboard last in Phase 1** — aggregates data from everything above

### 1.3 Critical Path

```
F0 (scaffold) → F1 (auth) → F2 (products) → F4 (POS) → F7 (dashboard)
```

Everything else (stock, labels, purchases, suppliers, customers, settings) runs in parallel off the side of this critical path once its backend dependency is ready.

---

## 2. Pre-Development Setup (F0)

**Goal:** A developer can clone the repo, install, and start building screens. All shared components, design tokens, stores, and the API client are ready. No backend dependency.

**Runs in parallel with:** Backend M0

### 2.1 Project Scaffold

| # | Task | Output |
|---|------|--------|
| 1 | Initialize Vite + React 19 + TypeScript project in `apps/web/` | Project runs |
| 2 | Install all dependencies: react, @tanstack/react-query, @tanstack/react-router, zustand, tailwindcss, zod, react-hook-form, @hookform/resolvers, lucide-react, recharts, date-fns, dexie, html5-qrcode, react-to-print, vite-plugin-pwa, sonner | Dependencies installed |
| 3 | Install dev dependencies: vitest, @testing-library/react, @testing-library/jest-dom, @playwright/test, msw, storybook, eslint, prettier, husky, lint-staged | Dev tools installed |
| 4 | Create `index.html`, `src/main.tsx` (React root + providers), `src/app.tsx` (router mount) | App renders "Hello" |
| 5 | Set up `src/config/env.ts` — `VITE_API_URL` from Vite env | Config ready |
| 6 | Create `.env.example` with `VITE_API_URL=http://localhost:3000` | Template ready |
| 7 | Create `Dockerfile` (multi-stage: build + Nginx serve) + `nginx.conf` (SPA fallback) | Container ready |
| 8 | Set up ESLint (with react, jsx-a11y plugins), Prettier, Husky + lint-staged | Linting works |
| 9 | Configure `vite-plugin-pwa` with `registerType: 'prompt'` (NOT `'autoUpdate'`). Implement a **"New version available — tap to reload" toast** that appears when the service worker detects a new build. This is critical: during rapid Phase 1 development, the service worker aggressively caches `index.html` and JS bundles. Without an update prompt, testers and the store owner will see stale UI and report bugs that are already fixed. The toast calls `registration.waiting.postMessage({ type: 'SKIP_WAITING' })` on tap, then `window.location.reload()` | PWA update prompt |
| 10 | Set up GitHub Actions CI: lint → typecheck → test → build → bundle size check | CI pipeline |

### 2.2 Design Tokens & Tailwind

| # | Task | Output |
|---|------|--------|
| 10 | Create `src/styles/globals.css` — all CSS custom properties (RGB triplets): primary (Indigo), accent (Amber), neutrals (Slate), semantic (success/warning/error/info), POS-specific. Include `@media (prefers-reduced-motion)` rule. Include `@media print` rules for receipt (80mm width) | Token system ready |
| 11 | Create `tailwind.config.ts` — extend colors via `rgb(var(--token) / <alpha-value>)` pattern, fontFamily (Inter + JetBrains Mono), plugin: `tailwindcss-animate` | Tailwind configured |
| 12 | Create `src/lib/cn.ts` — clsx + tailwind-merge utility | Class merging utility |
| 13 | Import Inter (variable) and JetBrains Mono (variable) fonts — prefer `@fontsource` packages or Google Fonts preload in `index.html` | Fonts loaded |

### 2.3 Core Utilities

| # | Task | Output |
|---|------|--------|
| 14 | Create `src/lib/format-currency.ts` — `formatIndianCurrency()` via `Intl.NumberFormat('en-IN')`, `formatCompact()` for dashboard KPIs (₹1.2L, ₹3.4Cr) | Currency formatting |
| 15 | Create `src/lib/format-date.ts` — DD-MM-YYYY formatting, relative dates via date-fns | Date formatting |
| 16 | Create `src/lib/financial-year.ts` — `getCurrentFinancialYear()`, `getQuarter()` | FY helpers |
| 17 | Create `src/lib/gst.ts` — client-side GST display helpers (format tax breakup for bill preview, NOT calculation — calculation is backend) | GST display helpers |
| 18 | Create `src/lib/feedback.ts` — `playScanFeedback()` with preloaded Audio + `navigator.vibrate(50)` | Sound/haptic feedback |
| 19 | Write unit tests for formatCurrency, formatDate, financial year helpers | Tests pass |

### 2.4 API Client & Types

| # | Task | Output |
|---|------|--------|
| 20 | Create `src/types/models.ts` — TypeScript interfaces for all entities: Product, Bill, BillItem, Customer, Supplier, LedgerEntry, etc. | Type definitions |
| 21 | Create `src/types/api.ts` — `ApiResponse<T>`, `PaginatedResponse<T>`, `ApiError` matching backend envelope `{ success, data, meta, error }` | API types |
| 22 | Create `src/types/enums.ts` — `UserRole`, `BillStatus`, `PaymentMode`, `GstScheme`, etc. | Enum types |
| 23 | Create `src/api/client.ts` — fetch wrapper with: auth header injection, 401 → silent refresh → retry, standard error parsing, `credentials: 'include'` for refresh cookie | API client |
| 24 | Create `src/api/` files for each module: `auth.api.ts`, `products.api.ts`, `bills.api.ts`, `customers.api.ts`, `suppliers.api.ts`, `purchases.api.ts`, `stock.api.ts`, `cash-register.api.ts`, `dashboard.api.ts`, `settings.api.ts`, `labels.api.ts`, `uploads.api.ts`, `reports.api.ts` | API functions |
| 25 | Create TanStack Query `queryKeys.ts` — hierarchical key convention for all entities | Cache key structure |
| 26 | Set up MSW handlers (`src/mocks/handlers.ts`) for all Phase 1 endpoints — enables `npm run dev:mock` without backend. **Critical: the `GET /products` handler must simulate a paginated database of at least 1,000 dummy products** (auto-generated with realistic names, SKUs, barcodes, prices, categories). This is essential for testing: (a) the IndexedDB catalog sync pagination logic, (b) product search performance against a realistic dataset, (c) Dexie bulk-insert behavior with 1,000+ rows. A mock returning 5 static products will hide real bugs in the sync pipeline | Mock API with realistic dataset |

### 2.5 State Stores

| # | Task | Output |
|---|------|--------|
| 27 | Create `src/stores/auth.store.ts` — user, accessToken (memory only), tenant, isAuthenticated, login(), logout() | Auth state |
| 28 | Create `src/stores/cart.store.ts` — items, customerId, additionalDiscount, addItem/removeItem/updateQuantity/setCustomer/clear, computed selectors (subtotal, catalogDiscountTotal, netAmount, itemCount) | Cart state |
| 29 | Create `src/stores/ui.store.ts` — sidebarCollapsed, scanMode, offlineBannerDismissed, currentRegisterId | UI state |
| 30 | Write unit tests for cart store: add item, increment qty on re-add, remove, clear, correct totals | Tests pass |

### 2.6 Hooks

| # | Task | Output |
|---|------|--------|
| 31 | Create `src/hooks/use-auth.ts` — wraps auth.store with login/logout mutations | Auth hook |
| 32 | Create `src/hooks/use-tenant.ts` — current tenant info, gstScheme, settings | Tenant hook |
| 33 | Create `src/hooks/use-role.ts` — `isOwner`, `canViewCostPrice`, `canProcessReturn`, `canManageSettings`, etc. | Role hook |
| 34 | Create `src/hooks/use-online.ts` — `navigator.onLine` + event listeners | Network hook |
| 35 | Create `src/hooks/use-debounce.ts` | Debounce hook |
| 36 | Create `src/hooks/use-media-query.ts` — breakpoint detection | Responsive hook |

### 2.7 Layout Components

| # | Task | Output |
|---|------|--------|
| 37 | Install and customize Shadcn/ui primitives: Button, Input, Dialog, Sheet, Select, DropdownMenu, Badge, Tooltip, Form, Label, Textarea, Checkbox, RadioGroup, Switch, Tabs, Card, Table, Separator | UI primitives |
| 38 | Install Sonner toast (Shadcn integration) | Toast system |
| 39 | Create `src/components/layout/sidebar.tsx` — collapsible, logo top, nav items (role-filtered via useRole), user avatar + role bottom, active state highlight | Desktop nav |
| 40 | Create `src/components/layout/bottom-nav.tsx` — 5 tabs, POS center/prominent (FAB-style), unread badge support, role-dependent items | Mobile nav |
| 41 | Create `src/components/layout/top-bar.tsx` — title left, notification bell + user avatar right | Mobile header |
| 42 | Create `src/components/layout/breadcrumb.tsx` | Desktop breadcrumb |
| 43 | Create `src/components/layout/app-shell.tsx` — uses `useMediaQuery` to switch sidebar (lg+) vs bottom-nav (< lg). Wraps `<Outlet />` | Responsive shell |

### 2.8 Shared Components

| # | Task | Output |
|---|------|--------|
| 44 | Create `data-table.tsx` — table on desktop (sortable, sticky header, row click), card list on mobile. Accept `Column<T>[]` config with `hideOnMobile`, `sortable`, `render` options | Universal list |
| 45 | Create `kpi-card.tsx` — icon, label, large number, comparison arrow/% | Dashboard widget |
| 46 | Create `status-badge.tsx` — colored pill (success/warning/error/info + text) | Status indicator |
| 47 | Create `amount.tsx` — monospace (`font-mono tabular-nums`), right-aligned, `formatIndianCurrency()`, negative in `text-error-500` | Currency display |
| 48 | Create `empty-state.tsx` — illustration + message + CTA button | Empty lists |
| 49 | Create `ledger-row.tsx` — date, description, debit (red), credit (green), balance | Ledger display |
| 50 | Create `loading-skeleton.tsx` — animated placeholder blocks | Loading state |
| 51 | Create `search-input.tsx` — debounced (300ms), clear button, barcode icon on mobile | Search input |
| 52 | Create `currency-input.tsx` — ₹ prefix, auto-comma formatting, `inputMode="decimal"` on mobile | Money input |
| 53 | Create `qty-stepper.tsx` — +/- buttons, tap center to type, min 0 | Quantity input |
| 54 | Create `date-range-picker.tsx` — presets (Today, Yesterday, This Week, This Month, This Quarter, This FY, Custom) | Date filter |
| 55 | Create `multi-select-filter.tsx` — dropdown with checkboxes, "Apply" button, pill tags | Multi-filter |
| 56 | Create `image-upload.tsx` — presigned URL flow (POST /uploads/presign → PUT to S3 → return key). Drag-drop desktop, camera/gallery mobile, thumbnail preview | File upload |
| 57 | Create `form-stepper.tsx` — horizontal step indicators, back/next buttons | Wizard stepper |
| 58 | Create `offline-banner.tsx` — persistent amber banner, uses `useOnline()` | Offline indicator |
| 59 | Create `confirm-dialog.tsx` — title, message, Cancel + red destructive button | Destructive confirm |
| 60 | Set up Storybook — add stories for: Button, Amount, StatusBadge, KpiCard, DataTable, QtySteppper, CurrencyInput, EmptyState | Visual documentation |

### 2.9 Route Scaffold

| # | Task | Output |
|---|------|--------|
| 61 | Create TanStack Router config + file-based route structure | Router works |
| 62 | Create `routes/__root.tsx` — error boundary, QueryClientProvider, Zustand providers | Root layout |
| 63 | Create `routes/_auth.tsx` — centered card layout, redirect to `/` if logged in | Auth layout |
| 64 | Create `routes/_app.tsx` — auth guard (redirect to `/login` if not authenticated, redirect to `/setup` if !setupComplete), wraps `<AppShell>` | App layout |
| 65 | Create `routes/_app.pos.tsx` — full-screen layout (`h-dvh flex flex-col`), no sidebar/bottom-nav | POS layout |
| 66 | Create placeholder pages for all 28 Phase 1 routes — each renders page title + "Coming soon" | Routes navigable |

### Definition of Done (F0)

- [ ] `npm run dev` starts the app, renders login page
- [ ] `npm run dev:mock` starts with MSW — all API calls return mock data
- [ ] All shared components visible in Storybook
- [ ] Navigation works: sidebar on desktop, bottom tabs on mobile, POS is full-screen
- [ ] `npm test` passes utility + cart store tests
- [ ] CI pipeline green: lint + typecheck + tests + build + bundle size < 500KB initial JS
- [ ] Role hook correctly filters nav items for owner/manager/salesperson

---

## 3. Phase 1 Milestones

### F1: Auth, Setup Wizard & Settings

**Goal:** Users can log in, complete the setup wizard, and manage basic settings.

**Depends on:** F0 (components), Backend M1 (auth endpoints)

| # | Task | Screen(s) |
|---|------|-----------|
| 1 | Build Login page — phone + password form, link to forgot password, calls `POST /auth/login`, stores token in Zustand (memory only), redirects to `/` or `/setup` | Login |
| 2 | Build Forgot Password page — email/phone input, calls `POST /auth/forgot-password` | Forgot Password |
| 3 | Build Reset Password page — new password + confirm, calls `POST /auth/reset-password` | Reset Password |
| 4 | Implement token refresh logic in API client — on 401, silently call `POST /auth/refresh` (cookie sent auto), retry original request. On refresh failure → logout → `/login` | API client |
| 5 | Implement session restoration on app load — call `POST /auth/refresh` on mount (token lost on tab close, cookie persists 7 days) | App bootstrap |
| 6 | Build Setup Wizard — 3 mandatory steps with `form-stepper.tsx`: (1) Store Details (name, address, phone, email, logo upload via presigned URL), (2) GST Configuration (GSTIN, scheme selector with explanation cards, FY start month), (3) Team (owner auto-created, optional staff invites). "Ready!" screen with "Go to Dashboard" button | Setup Wizard |
| 7 | Build Getting Started Checklist component — 7 items (categories, products, opening stock, customer balances, supplier balances, first barcode, test bill). Persisted in tenant settings. Dismissible via "I'm all set" | Dashboard widget |
| 8 | Build Settings Hub — card grid linking to sub-pages | Settings Hub |
| 9 | Build Store Settings — edit store profile + GST scheme toggle + logo upload | Store Settings |
| 10 | Build User Management — list users, invite new, edit role, deactivate, reset password | User Management + Create/Edit |
| 11 | Build Category & Size Management — manage categories (add/edit/reorder/deactivate), sub-types, size systems, brands. All CRUD inline or via modals | Category & Size Management |

**Tests:**
- Component: Login form validation, Setup Wizard step navigation
- E2E: Login → dashboard loads → logout works
- E2E: Setup wizard → complete → redirects to dashboard with checklist

**Definition of Done:**
- [ ] Full login/logout/refresh cycle works
- [ ] Setup wizard creates tenant and seeds defaults
- [ ] Settings pages functional for owner, hidden for salesperson
- [ ] Session survives tab close (refresh token restores it)

---

### F2: Product Catalog

**Goal:** Owner/Manager can create, edit, search, and import products. Salesperson can view (without cost price).

**Depends on:** F1 (auth + categories), Backend M2

| # | Task | Screen(s) |
|---|------|-----------|
| 1 | Build Product List — filterable by category, brand, stock status. Sortable by name/stock/price. Uses `data-table.tsx`. Infinite scroll. Search bar at top | Product List |
| 2 | Build Product Detail — all product info, stock qty (from `current_stock`), edit button. Role-conditional: hide cost price for salesperson | Product Detail + Salesperson View |
| 3 | Build Product Create/Edit form — `react-hook-form` + Zod. Fields: name, category (dropdown), sub-type, brand, size (from size system), SKU (auto-generated or manual), HSN, cost price, selling price, MRP, GST rate, catalog discount %, min stock level, images (upload via presigned URL) | Product Create/Edit |
| 4 | Build Bulk Import screen — file upload (CSV/Excel), preview parsed rows in data-table, inline validation errors, confirm button. Polls `GET /import/:jobId/status` for progress | Bulk Import |

**Tests:**
- Component: Product form validates required fields, SKU format
- E2E: Create product → appears in list → edit → verify changes → archive → disappears from list

**Definition of Done:**
- [ ] Full product CRUD
- [ ] Search returns results instantly (< 500ms perceived)
- [ ] Bulk import processes a CSV and shows progress
- [ ] Salesperson view hides cost price

---

### F3: Stock Overview & Labels

**Goal:** Stock visibility and barcode label printing.

**Depends on:** F2 (products), Backend M3

| # | Task | Screen(s) |
|---|------|-----------|
| 1 | Build Stock Overview — all SKUs with current qty, color-coded status badges (green In Stock / amber Low / red Out), filters by category and status, summary cards at top (total SKUs, in stock, low, out) | Stock Overview |
| 2 | Build Barcode/Label Manager — select products (multi-select with search), set qty per product, choose template (default: barcode + name + size + price), preview, print. Calls `POST /labels/generate`, receives PDF, triggers `window.print()` | Barcode/Label Manager |

**Definition of Done:**
- [ ] Stock overview correctly shows current_stock with color coding
- [ ] Label sheet generates and prints via browser print dialog

---

### F4: POS Billing (Most Critical Milestone)

**Goal:** Salespeople can scan/search products, build a cart, apply discounts, split payment, and complete a sale. This is the core revenue operation.

**Depends on:** F2, F3 (products + stock), Backend M4. **Can start building UI shell and cart logic against MSW mocks during F2/F3.**

#### F4.0: Scanner & Printer PoC (DO FIRST — before any POS UI)

Both the scanner and the printer are hardware integrations that can behave unpredictably on mobile browsers. Prove they work before building the POS.

**Scanner PoC:**

| # | Task |
|---|------|
| 1 | Build standalone `/scanner-poc` test page |
| 2 | Test: `readonly` input + `keydown` listener with Bluetooth scanner on **Android Chrome** |
| 3 | Test: same on **iOS Safari** — check for zoom, keyboard popup, scanner keystroke delivery |
| 4 | Test fallback: off-screen `<textarea>` at `-9999px`, focused programmatically |
| 5 | Test: camera-based scanning with `html5-qrcode` on both platforms |
| 6 | Document results, decide final Scan Mode implementation approach |

**Printer PoC:**

| # | Task |
|---|------|
| 7 | Test: `window.print()` on **desktop** (USB thermal printer, 80mm paper) — verify receipt prints correctly without manual paper size selection |
| 8 | Test: `window.print()` on **Android Chrome** (WiFi thermal printer) — measure how many taps the OS print spooler requires and how many seconds it adds. If it exceeds 5 seconds or requires manual paper size selection, `window.print()` is NOT viable for mobile POS |
| 9 | Test alternative: **Web Bluetooth API** to send raw ESC/POS commands directly to a Bluetooth thermal printer (bypasses print dialog entirely). Test on Android Chrome (Web Bluetooth is supported). Not available on iOS |
| 10 | Test alternative: **RawBT** (Android app) or similar raw printing intent that intercepts print requests and routes them to a Bluetooth/USB thermal printer without the OS dialog |
| 11 | Document results. Decide the print strategy per device tier: Desktop (window.print — works), Mobile + WiFi printer (window.print if fast enough, else explore alternatives), Mobile + Bluetooth printer (Web Bluetooth API or RawBT) |

**Gate:** Do NOT proceed to F4.1 until both PoC results are documented. The scan bar implementation and the bill completion flow both depend on these results.

#### F4.1: POS Infrastructure

| # | Task |
|---|------|
| 7 | Create `src/db/offline-db.ts` — Dexie database with `products` and `offlineBills` tables |
| 8 | Create `src/lib/catalog-sync.ts` — full sync on first login (paginated fetch → IndexedDB bulk insert), incremental sync every 5 min using `updated_after` param, sync state observable (`idle/syncing/ready/error`) |
| 9 | Create `CatalogSyncIndicator` component — "Syncing catalog..." spinner in top bar |
| 10 | Create `src/hooks/use-product-search.ts` — online: hits API, falls through to IndexedDB. Offline: queries IndexedDB. Handles `CatalogNotReadyError` (catalog not yet synced → friendly toast instead of "not found") |
| 11 | Create `src/hooks/use-scanner.ts` — prefix/suffix mode (primary, configurable prefix e.g. `~`) + timer-based fallback (80ms gap). Based on PoC results |
| 12 | Create `src/hooks/use-keyboard-shortcut.ts` — with INPUT/TEXTAREA focus guard for F1–F8. Esc and Ctrl+P always active |
| 13 | Create `src/components/form/camera-scanner.tsx` — html5-qrcode with robust cleanup (try/catch/finally, force-stop all video tracks on unmount) |

#### F4.2: POS Screen

| # | Task | Screen(s) |
|---|------|-----------|
| 14 | Build POS layout — full-screen, no nav shell. Mobile: scan bar (collapses on scroll) + cart (fills remaining) + totals/pay (pinned bottom). Desktop: 60/40 split | POS Billing |
| 15 | Build scan bar — auto-focused input, Scan Mode toggle (Type/Scan, persisted in localStorage), camera scan button (mobile), hold/recall icons | Scan bar |
| 16 | Build cart list — `cart-item.tsx` rows with product name+size, qty stepper, unit price, line total, swipe-left to remove, per-item catalog discount as subline | Cart |
| 17 | Build totals bar — subtotal, discount summary (tap to open discount sheet), net payable (large/bold/mono), full-width PAY button | Totals + Pay |
| 18 | Build discount sheet — bottom sheet with flat ₹ amount OR percentage input, real-time preview of calculated result | Discount Sheet |
| 19 | **Integrate all POS interactions**: barcode scan → `useProductSearch` → `cartStore.addItem()` → sound/haptic feedback. Search → debounced results → tap to add. Qty stepper. Keyboard shortcuts (F1–F8) | Integration |
| 20 | **GST scheme adaptation**: if `tenant.gstScheme === 'composition'`, hide all tax columns in cart and totals. If `regular`, optionally show tax summary on expand | Scheme UI |

#### F4.3: Payment & Bill Completion

| # | Task | Screen(s) |
|---|------|-----------|
| 21 | Build Payment Modal — header with total, customer search (by phone) / create new (Customer Quick-Add inline) / skip walk-in. Three payment rows (Cash/UPI/Card) with auto-fill. Credit toggle (only if customer selected). "Complete Sale" button disabled until balanced | Payment Modal + Customer Quick-Add |
| 22 | Implement bill creation mutation — `POST /bills` with `clientId: crypto.randomUUID()`. On success: `cart.clear()`, navigate to bill preview, invalidate queries (bills, dashboard, products) | Mutation |
| 23 | Handle billing errors: `DISCOUNT_LIMIT_EXCEEDED` → toast "Ask manager to approve", `PAYMENT_UNBALANCED` → toast, generic → toast | Error handling |
| 24 | Build Bill Preview — print-ready receipt component. Tax Invoice (Regular) vs Bill of Supply (Composition) with mandatory declaration. Print via `window.print()` + `@media print` CSS | Bill Preview |
| 25 | Build Bill History — searchable list with filters (date, customer, salesperson, payment mode). Uses `data-table.tsx` | Bill History |
| 26 | Build Bill Detail — full bill with all line items, discounts, payment breakdown. Reprint button | Bill Detail |

**Tests:**
- Unit: cart store — add, remove, qty update, totals correct, clear
- Component: Payment Modal — amounts balance, credit toggle visibility, split payment math
- Component: Bill Receipt — correct format for Regular vs Composition scheme
- E2E: Search product → add to cart → apply discount → split Cash+UPI → complete sale → bill preview renders → print dialog opens
- E2E: Salesperson exceeds discount limit → error toast
- E2E: POS responsive on 360px viewport — 5-item cart scrollable, totals visible

**Definition of Done:**
- [ ] Full POS billing cycle works end-to-end
- [ ] Barcode scan adds items instantly with sound feedback
- [ ] Split payment (Cash + UPI + Card) works
- [ ] Credit sale creates customer khata entry
- [ ] Both GST schemes render correctly
- [ ] Works on 360px mobile viewport
- [ ] Keyboard shortcuts work (F1–F8) and are suppressed in inputs

---

### F5: Purchases

**Goal:** Record incoming goods from suppliers.

**Depends on:** F2 (products), Backend M5

| # | Task | Screen(s) |
|---|------|-----------|
| 1 | Build Goods Receipt form — select supplier (dropdown with search), invoice number, invoice date, upload invoice image (presigned URL), add line items (product, qty, cost price, GST details). Submit creates purchase | Goods Receipt |
| 2 | Build Purchase History — list of all purchases, filter by supplier and date, tap for detail | Purchase History |

**Definition of Done:**
- [ ] Direct purchase records correctly
- [ ] Invoice image uploads to S3

---

### F6: Suppliers, Customers & Khata

**Goal:** Full supplier/customer management with credit ledger.

**Depends on:** F4 (billing creates ledger entries), F5 (purchases create supplier entries), Backend M6

| # | Task | Screen(s) |
|---|------|-----------|
| 1 | Build Supplier List — searchable, shows name + outstanding balance (red if overdue) + phone. Quick-pay button | Supplier List |
| 2 | Build Supplier Detail — contact info, GSTIN, payment terms. Tabs: Ledger (running balance via API), Products Supplied, Purchase History | Supplier Detail |
| 3 | Build Supplier Create/Edit form | Supplier Create/Edit |
| 4 | Build Supplier Payment — amount, mode (cash/UPI/bank/cheque), reference, date, notes | Supplier Payment |
| 5 | Build Customer List — searchable by name/phone, outstanding balance, filter by with-balance/all | Customer List |
| 6 | Build Customer Detail / Khata — profile, ledger tab (chronological entries with running balance), purchase tab (all bills), summary tab (aging: <30, 30-60, 60-90, >90 days) | Customer Khata |
| 7 | Build Customer Create/Edit form | Customer Create/Edit |
| 8 | Build Customer Payment — amount, mode, reference, date, notes | Customer Payment |

**Tests:**
- E2E: Credit sale → customer khata shows debit → record payment → balance decreases
- E2E: Purchase → supplier ledger shows debit → record payment → balance decreases

**Definition of Done:**
- [ ] Full supplier and customer CRUD
- [ ] Khata ledger shows running balance correctly
- [ ] Payment recording updates balance in real-time

---

### F7: Cash Register & Dashboard

**Goal:** Cash register tracking and the home screen dashboard.

**Depends on:** F4 (billing feeds register + dashboard), F6 (credit data for dashboard), Backend M7

| # | Task | Screen(s) |
|---|------|-----------|
| 1 | Build Cash Register — open (enter opening balance), view today's register (all inflows/outflows line by line), close (enter counted cash → show discrepancy), history of past registers | Cash Register |
| 2 | Build Owner/Manager Dashboard — KPI cards (today's sales, profit, cash-in-hand, receivables), charts (payment mode donut, sales trend 7-day bar), action lists (low stock, payments due, recent bills). Uses `kpi-card.tsx`, Recharts | Owner Dashboard |
| 3 | Build Salesperson Dashboard — my sales today, my cash register, quick-bill button, recent my bills | Salesperson Dashboard |
| 4 | Integrate Getting Started Checklist on dashboard (from F1) — track completion state, dismiss permanently | Checklist widget |

**Tests:**
- E2E: Open register → create bill (cash) → close register → discrepancy correct
- E2E: Dashboard shows today's sales after creating a bill
- Component: KPI cards render correct formatted numbers

**Definition of Done:**
- [ ] Cash register open/close flow works
- [ ] Dashboard shows all widgets with real data
- [ ] Salesperson sees only own data

---

### Phase 1 Complete Checklist

- [ ] All F1–F7 definitions of done pass
- [ ] All 7 E2E critical flows pass in Playwright (Chrome + mobile Safari emulation):
  1. Login → role-correct dashboard
  2. POS full billing cycle (scan → discount → split payment → print)
  3. Salesperson discount limit enforcement
  4. Customer quick-add during POS
  5. Product CRUD lifecycle
  6. Customer khata (credit sale → payment → balance)
  7. POS responsive on 360px viewport
- [ ] Bundle size: initial JS < 500KB
- [ ] `npm test` all unit + component tests pass
- [ ] CI pipeline green
- [ ] Manual smoke test on a real Android phone (Chrome): login → POS → scan barcode → bill → print receipt

---

## 4. Phase 2 Milestones

### F8: Accounting, Reports & Advanced Inventory

**Depends on:** Phase 1 complete, Backend M8–M11

| # | Task | Screen(s) |
|---|------|-----------|
| 1 | Build PO List, PO Create/Edit, PO Detail — status badges, link goods receipt to PO | 3 PO screens |
| 2 | Build Purchase Return screen | 1 screen |
| 3 | Build Stock Adjustment — product select, qty +/-, reason code, notes | 1 screen |
| 4 | Build Stock Audit — select products, enter counted qty, variance report, approve | 1 screen |
| 5 | Build Sales Overview — charts (daily/weekly/monthly), period selector, breakdown by category/brand/salesperson | 1 screen |
| 6 | Build GST Dashboard — scheme indicator, output tax, ITC (Regular) or turnover (Composition). Links to return data views | 1 screen |
| 7 | Build GST Return Data Views — GSTR-1, GSTR-3B, CMP-08, GSTR-4 as tabular data. Export button | 1 screen |
| 8 | Build ITC Register (Regular only) — purchase-wise ITC ledger | 1 screen |
| 9 | Build Expense List + Create/Edit — category dropdown, amount, description, recurring toggle, receipt upload | 2 screens |
| 10 | Build P&L — period selector, revenue/COGS/gross profit/expenses/net profit, bar charts, category drilldown | 1 screen |
| 11 | Build Reports Hub — card grid of all 17 report types | 1 screen |
| 12 | Build Report Viewer — shared layout: date range picker, filter bar, data table, export (PDF/Excel) button. Content/columns change per report type | 1 screen |
| 13 | Build Activity Log (Audit) — filterable by user, action, entity, date. Expandable rows with old/new values | 1 screen |
| 14 | Implement Bill Void — confirm dialog, reverses in backend | Addition to Bill Detail |

**Definition of Done:**
- [ ] All 17 reports return correct data
- [ ] PDF/Excel export downloads successfully
- [ ] GST dashboard correct for both schemes

---

## 5. Phase 3 Milestones

### F9: Offline Sync, Returns, Notifications

**Depends on:** Phase 2 complete, Backend M12–M14

| # | Task | Screen(s) |
|---|------|-----------|
| 1 | Implement offline bill queue — when offline, `POST /bills` stores to Dexie `offlineBills` table instead of API. On reconnect, `syncOfflineBills()` calls `POST /bills/sync` | POS enhancement |
| 2 | Build Sync Conflicts screen — list failed bills, resolution actions (force accept / edit / void) for owner/manager. Dashboard badge for unresolved conflicts | 1 screen + badge |
| 3 | Build Held Bills — save current cart as held, list, resume, discard | 1 screen |
| 4 | Build Returns & Exchanges — bill lookup (scan/search), select items, return reason, refund mode, exchange flow | 1 screen |
| 5 | Build Notification Center — chronological list, unread badge, tap to navigate. Poll `GET /notifications/unread-count` every 30s | 1 screen + badge |
| 6 | Build OTP Verification page | 1 screen |
| 7 | Build Threshold Settings — low stock, aging, return window, salesperson max discount | 1 screen |
| 8 | Build Template Settings — receipt header/footer, label template selection | 1 screen |
| 9 | Implement PWA install prompt — detect installability, show in-app banner | PWA enhancement |

**Definition of Done:**
- [ ] Offline billing works: go offline → create bills → come back online → sync succeeds
- [ ] Returns always use original bill prices
- [ ] Notifications poll and display unread count

---

## 6. Phase 4 Milestones

### F10: SaaS & Super Admin

**Depends on:** Phase 3 complete, Backend M15

| # | Task | Screen(s) |
|---|------|-----------|
| 1 | Build Tenant Sign-up page — business name, owner details, plan selection | 1 screen |
| 2 | Build Admin Dashboard — total tenants, active users, revenue chart | 1 screen |
| 3 | Build Tenant List — all tenants with status, plan, user count | 1 screen |
| 4 | Build Tenant Detail — tenant info, usage stats, support actions (suspend/activate) | 1 screen |

---

## 7. Backend Alignment & Parallelism

### 7.1 Parallel Work Strategy

The frontend is **never idle** — when waiting for a backend milestone, there is always scaffold, component, or mock-based work to do.

```
Week 1-2:  [FE: F0 scaffold + components]  ←→  [BE: M0 setup]
Week 3:    [FE: F1 auth + setup]            ←→  [BE: M1 auth]     (integrate as M1 delivers)
Week 4:    [FE: F2 products]                ←→  [BE: M2 products]  (integrate as M2 delivers)
Week 4+:   [FE: F4.0 Scanner PoC]          ←→  [BE: M3 stock]     (PoC runs in parallel)
Week 5:    [FE: F4 POS UI + cart]           ←→  [BE: M4 billing]   (UI against mocks, integrate when M4 ready)
Week 5-6:  [FE: F3 stock + F5 purchases]   ←→  [BE: M5 purchases]
Week 6:    [FE: F6 suppliers + customers]   ←→  [BE: M6 credit]
Week 7:    [FE: F7 dashboard]               ←→  [BE: M7 dashboard]
```

### 7.2 MSW as the Unblocking Tool

Every frontend screen can be developed and component-tested without the backend by using MSW mock handlers. The `npm run dev:mock` script starts the app with all API calls intercepted by MSW. Integration testing against the real backend happens when each backend milestone completes.

### 7.3 Critical Integration Points

| Frontend | Backend | What Must Work Together |
|----------|---------|------------------------|
| F4 (POS) | M4 (Billing) | Full bill creation → stock update → ledger entry → print. This is the **most important integration test** |
| F6 (Khata) | M6 (Credit) | Credit sale → ledger entry → outstanding_balance → payment → balance decreases |
| F7 (Dashboard) | M7 (Dashboard) | Single `GET /dashboard` → all KPI cards render correctly |
| F4 (Catalog Sync) | M2 (Products with `updated_after`) | Incremental sync using `?updated_after=` timestamp works |

---

## 8. Critical Implementation Notes

Every frontend developer must read this section before writing code.

### 8.1 Access Token — Memory Only

Store the JWT access token in Zustand (in-memory) ONLY. **Never in localStorage or sessionStorage.** On tab close, the token is lost. On app load, call `POST /auth/refresh` (cookie persists 7 days) to restore the session. This protects against XSS token theft.

### 8.2 Money Display — Use `Intl.NumberFormat`

All currency display uses `Intl.NumberFormat('en-IN')` which natively handles Indian numbering (lakhs, crores). Do NOT write custom comma-insertion logic. All amounts rendered via the shared `<Amount />` component with `font-mono tabular-nums`.

**Note:** Financial *calculations* happen on the backend using `decimal.js`. The frontend only *displays* amounts — never computes totals for submission. Cart totals are for display only; the backend recomputes everything on `POST /bills`.

### 8.3 Offline — Dexie, Not Workbox

Workbox handles app shell caching only (JS, CSS, HTML, fonts). Product data and offline bills are stored in **Dexie.js (IndexedDB)**. Never rely on Workbox runtime caching for API calls that the POS needs offline.

### 8.4 Scanner PoC — Gate Before POS

The Scanner PoC (F4.0) MUST be completed and documented before building the POS scan bar. Do not assume `readonly` + `keydown` will work on iOS Safari. The PoC determines the final implementation.

### 8.5 Camera Cleanup — Force Stop Tracks

When the camera scanner component (`html5-qrcode`) unmounts, wrap cleanup in try/catch/finally. In the `finally` block, force-stop ALL active video tracks: `document.querySelectorAll('video').forEach(v => v.srcObject?.getTracks().forEach(t => t.stop()))`. This prevents the camera light from staying on.

### 8.6 First Sync UX — Don't Show "Not Found"

If a barcode is scanned before the initial catalog sync completes (Dexie empty), show "Loading offline catalog, please wait..." instead of "Product not found". Use the `CatalogNotReadyError` pattern from Frontend Tech Spec Section 10.2.1.

### 8.7 Keyboard Shortcuts — Input Guard

F1–F8 shortcuts MUST be suppressed when `INPUT`, `TEXTAREA`, or `contentEditable` elements are focused. Otherwise typing a search query or discount amount will accidentally trigger hold/payment/recall. `Esc` and `Ctrl+P` remain active always.

### 8.8 GST Scheme — Single Flag, Multiple Surfaces

`tenant.gstScheme` (`regular` | `composition`) affects: POS cart columns, POS totals section, Bill Preview format, Bill Preview header text, GST dashboard content, GST return data views. Every PR touching bill/invoice UI must verify both schemes render correctly.

### 8.9 Role-Based Visibility

Use the `useRole()` hook for all conditional rendering. Never hard-code role strings in components. Key rules:
- Salesperson: NO cost price, NO P&L, NO settings, NO returns (needs manager), max discount enforced
- Manager: everything except P&L, user management, store settings
- Owner: full access

---

## 9. Testing Checkpoints

### 9.1 Per-Milestone Testing

Every milestone must pass its defined tests (component + E2E) before proceeding.

### 9.2 Phase 1 Gate

All 7 E2E critical flows must pass in Playwright before Phase 1 is declared complete:

1. Login → role-dependent dashboard
2. POS: scan → discount → split payment → complete → print
3. POS: salesperson discount limit → error
4. Customer quick-add during POS
5. Product CRUD: create → list → edit → archive
6. Customer khata: credit sale → payment → balance update
7. POS on 360px mobile viewport (Playwright mobile emulation)

### 9.3 Visual Regression (Optional but Recommended)

Use Playwright screenshot comparison for key screens: Dashboard, POS (empty cart, 5-item cart, payment modal), Product List, Customer Khata. Catch unintended layout regressions.

### 9.4 Bundle Size Gate

CI fails if initial JS bundle exceeds 500KB. Enforce with a build step that checks the output. Key strategies to stay under:
- Lazy-load all routes except login + dashboard
- Manual chunk splitting (React, Query, Charts, Icons in separate chunks)
- Tree-shake Lucide icons (import individually, not the entire library)

---

## 10. Go-Live Checklist

Before the app is used at Kaushik Vastra Bhandar's counter:

### 10.1 Device Setup

- [ ] Primary POS device identified (laptop/tablet at counter)
- [ ] PWA installed on device (home screen shortcut)
- [ ] Barcode scanner paired (USB for desktop, Bluetooth for tablet)
- [ ] Scanner configured with Enter suffix (and prefix if supported)
- [ ] Thermal receipt printer connected (USB/WiFi)
- [ ] Test print: receipt prints correctly on 80mm paper
- [ ] Test print: barcode label sheet prints and scans back correctly

### 10.2 Data Verification (with Backend)

- [ ] Complete product catalog imported and verified — every item on the shelves is in the system
- [ ] All products have barcodes generated and labels printed
- [ ] Opening stock counts entered
- [ ] Customer credit balances entered
- [ ] Supplier credit balances entered
- [ ] All staff accounts created (owner, manager, salesperson)

### 10.3 User Training

- [ ] Owner trained on: dashboard, settings, reports, customer/supplier management
- [ ] Salesperson trained on: POS billing (scan, search, discount, payment, print), cash register open/close
- [ ] Everyone trained on: what "Offline" banner means, how to handle "please wait" during sync

### 10.4 Smoke Test at the Counter

- [ ] Salesperson scans 5 different products → all found
- [ ] Create a real bill with split payment (cash + UPI)
- [ ] Receipt prints correctly
- [ ] Dashboard updates with the sale
- [ ] Customer credit sale → appears in khata
- [ ] Open cash register → bills → close → discrepancy = ₹0

---

*End of Document*

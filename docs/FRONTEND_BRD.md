# Frontend BRD — InvenTrack

| Field            | Detail                                      |
| ---------------- | ------------------------------------------- |
| **Document Version** | 1.0                                     |
| **Date**         | 2026-03-29                                  |
| **Parent BRD**   | BRD.md v1.0                                 |
| **Status**       | Draft                                       |

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Color System](#2-color-system)
3. [Typography](#3-typography)
4. [Layout & Responsive Strategy](#4-layout--responsive-strategy)
5. [Navigation Structure](#5-navigation-structure)
6. [Complete Screen Inventory](#6-complete-screen-inventory)
7. [Screen Specifications](#7-screen-specifications)
8. [Shared Components](#8-shared-components)
9. [Iconography & Visual Language](#9-iconography--visual-language)
10. [Accessibility](#10-accessibility)

---

## 1. Design Principles

| Principle                | Meaning                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| **Speed over beauty**    | POS is used under pressure. Every tap counts. Prioritize speed of interaction over decoration |
| **Scannable, not readable** | Use numbers, colors, and icons to convey status. Minimize paragraphs of text             |
| **Thumb-friendly**       | Primary actions in the bottom 60% of mobile screens. Minimum touch target: 44x44px           |
| **Clarity over density** | Avoid cramming. Use progressive disclosure — show summary first, detail on tap               |
| **Consistent patterns**  | Every list, form, and detail screen follows the same layout pattern across modules            |
| **Offline-aware**        | Always show connectivity status. Never let the user wonder if data is saved                  |

---

## 2. Color System

### 2.1 Recommended Palette: **Indigo + Amber**

A professional, modern palette that works for all-day use without eye fatigue. Indigo conveys trust and reliability (important for financial software). Amber provides warmth and draws attention to key actions.

#### Primary — Indigo

| Token                  | Hex       | Usage                                           |
| ---------------------- | --------- | ----------------------------------------------- |
| `primary-50`           | `#EEF2FF` | Selected row background, light tint              |
| `primary-100`          | `#E0E7FF` | Hover states, active nav background              |
| `primary-200`          | `#C7D2FE` | Borders on active/focused elements               |
| `primary-500`          | `#6366F1` | Icons, links, secondary buttons                  |
| `primary-600`          | `#4F46E5` | **Main primary** — headers, primary buttons, nav |
| `primary-700`          | `#4338CA` | Button hover, active states                      |
| `primary-900`          | `#312E81` | Sidebar background (desktop), dark headers       |

#### Accent — Amber

| Token                  | Hex       | Usage                                           |
| ---------------------- | --------- | ----------------------------------------------- |
| `accent-50`            | `#FFFBEB` | Warning background tint                          |
| `accent-100`           | `#FEF3C7` | Badge backgrounds, highlight rows                |
| `accent-400`           | `#FBBF24` | Stars, highlights, attention badges              |
| `accent-500`           | `#F59E0B` | **Main accent** — CTA buttons, price highlights  |
| `accent-600`           | `#D97706` | Accent hover                                     |

#### Neutrals — Slate

| Token                  | Hex       | Usage                                           |
| ---------------------- | --------- | ----------------------------------------------- |
| `neutral-50`           | `#F8FAFC` | Page background                                  |
| `neutral-100`          | `#F1F5F9` | Card backgrounds, input backgrounds              |
| `neutral-200`          | `#E2E8F0` | Borders, dividers                                |
| `neutral-300`          | `#CBD5E1` | Disabled states, placeholder text                |
| `neutral-400`          | `#94A3B8` | Secondary text, captions                         |
| `neutral-500`          | `#64748B` | Body text (secondary)                            |
| `neutral-700`          | `#334155` | Body text (primary)                              |
| `neutral-800`          | `#1E293B` | Headings                                         |
| `neutral-900`          | `#0F172A` | High-emphasis text, dark mode background         |

#### Semantic Colors

| Token          | Hex       | Light BG    | Usage                                               |
| -------------- | --------- | ----------- | --------------------------------------------------- |
| `success-500`  | `#22C55E` | `#F0FDF4`   | In stock, payment received, profit positive, synced  |
| `success-700`  | `#15803D` | —           | Success text on light bg                             |
| `warning-500`  | `#F59E0B` | `#FFFBEB`   | Low stock, payment due soon, aging inventory         |
| `warning-700`  | `#B45309` | —           | Warning text on light bg                             |
| `error-500`    | `#EF4444` | `#FEF2F2`   | Out of stock, overdue, loss, discrepancy, offline    |
| `error-700`    | `#B91C1C` | —           | Error text on light bg                               |
| `info-500`     | `#3B82F6` | `#EFF6FF`   | Informational badges, tips, links                    |

#### POS-Specific Colors

| Token             | Hex       | Usage                                             |
| ----------------- | --------- | ------------------------------------------------- |
| `pos-bg`          | `#F8FAFC` | POS screen background (clean, minimal)            |
| `pos-cart-bg`     | `#FFFFFF` | Cart panel background                             |
| `pos-total-bg`    | `#312E81` | Total/payable bar — dark, high contrast           |
| `pos-total-text`  | `#FFFFFF` | Amount on total bar                               |
| `pos-cash`        | `#22C55E` | Cash payment badge                                |
| `pos-upi`         | `#8B5CF6` | UPI payment badge                                 |
| `pos-card`        | `#3B82F6` | Card payment badge                                |

### 2.2 Alternative Palettes

#### Option B: Teal + Coral (warmer, retail-friendly)

| Role      | Hex       | Notes                         |
| --------- | --------- | ----------------------------- |
| Primary   | `#0D9488` | Teal-600                      |
| Accent    | `#F97316` | Orange-500                    |
| Dark      | `#134E4A` | Teal-900 for sidebar/headers  |

#### Option C: Deep Blue + Gold (classic, traditional Indian retail)

| Role      | Hex       | Notes                         |
| --------- | --------- | ----------------------------- |
| Primary   | `#1E40AF` | Blue-800                      |
| Accent    | `#EAB308` | Yellow-500 / Gold             |
| Dark      | `#1E3A5F` | Navy for sidebar/headers      |

### 2.3 Dark Mode

Not in Phase 1 scope. Design all components with CSS custom properties / design tokens so dark mode can be added later by swapping the token values.

---

## 3. Typography

### Font Stack

| Role        | Font                          | Fallback                  | Why                                    |
| ----------- | ----------------------------- | ------------------------- | -------------------------------------- |
| **Headings** | Inter                        | system-ui, sans-serif     | Clean, highly legible, free, variable  |
| **Body**    | Inter                         | system-ui, sans-serif     | Single font family for consistency     |
| **Monospace** | JetBrains Mono              | ui-monospace, monospace   | SKU codes, bill numbers, amounts       |
| **Rupee (₹)** | Inherits from body          | —                         | Inter supports ₹ natively             |

### Type Scale

Sizes defined as relative scale tokens. Exact pixel values are determined during design implementation.

| Token       | Scale   | Weight   | Usage                                    |
| ----------- | ------- | -------- | ---------------------------------------- |
| `h1`        | 2xl     | Bold     | Page titles (Dashboard, Reports)         |
| `h2`        | xl      | Semibold | Section headings, card titles            |
| `h3`        | base    | Semibold | Sub-sections, widget titles              |
| `body`      | base    | Regular  | Default body text, form labels           |
| `body-sm`   | sm      | Regular  | Table cells, secondary info              |
| `caption`   | xs      | Regular  | Timestamps, helper text, badges          |
| `pos-total` | 3xl     | Bold     | Cart total / net payable on POS          |
| `pos-item`  | base+   | Medium   | Item names in POS cart                   |
| `price`     | base    | Semibold mono | All price/amount displays (monospace) |

Scale reference: `xs` < `sm` < `base` < `base+` < `lg` < `xl` < `2xl` < `3xl`. The design system should define these as `rem` values for accessibility (respects user font-size preferences).

### Number Formatting

- All monetary values rendered in monospace (`JetBrains Mono`)
- Indian numbering system: `₹12,34,567.00`
- Right-aligned in tables and cart
- Negative values in `error-500` red with minus sign: `-₹1,250.00`

---

## 4. Layout & Responsive Strategy

### Breakpoints

| Name       | Min Width | Target Device          | Layout                                   |
| ---------- | --------- | ---------------------- | ---------------------------------------- |
| `xs`       | 0px       | Small phones           | Single column, bottom nav                |
| `sm`       | 640px     | Large phones           | Single column, bottom nav                |
| `md`       | 768px     | Tablets (portrait)     | Two-column where useful, bottom nav      |
| `lg`       | 1024px    | Tablets (landscape)    | Sidebar nav + main content               |
| `xl`       | 1280px    | Desktop                | Sidebar nav + main content + detail panel|
| `2xl`      | 1536px    | Wide desktop           | Same as xl with wider content            |

### Layout Patterns

#### Mobile (xs–md): Bottom Tab Navigation

```
┌─────────────────────────┐
│  Top Bar (title + icons)│
├─────────────────────────┤
│                         │
│                         │
│     Main Content        │
│     (scrollable)        │
│                         │
│                         │
├─────────────────────────┤
│ 🏠  📦  🛒  👥  ☰     │
│ Home Stock POS  Cust More│
└─────────────────────────┘
```

#### Desktop (lg+): Sidebar Navigation

```
┌──────┬──────────────────────────────┐
│      │  Breadcrumb / Page Title     │
│ Logo │──────────────────────────────│
│      │                              │
│ Nav  │                              │
│ Menu │      Main Content            │
│      │                              │
│      │                              │
│      │                              │
│      │──────────────────────────────│
│ User │                              │
└──────┴──────────────────────────────┘
```

#### POS Layout (Special — Full Screen)

Mobile POS:
```
┌─────────────────────────┐
│ 🔍 Search / Scan bar    │
├─────────────────────────┤
│                         │
│  Cart Items (scroll)    │
│  - Item 1   ₹500       │
│  - Item 2   ₹750       │
│  - Item 3   ₹300       │
│                         │
├─────────────────────────┤
│  Subtotal    ₹1,550    │
│  Discount    -₹250     │
│ ┌─────────────────────┐ │
│ │  PAY ₹1,300         │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

Desktop POS (split view):
```
┌──────────────────────┬──────────────────────┐
│  Product Search      │  Cart                │
│  ┌────┐ ┌────┐      │                      │
│  │Scan│ │Type│      │  Item 1   ₹500       │
│  └────┘ └────┘      │  Item 2   ₹750       │
│                      │  Item 3   ₹300       │
│  Recent / Results    │                      │
│  ┌──────────────┐   │──────────────────────│
│  │ Product Card  │   │  Subtotal  ₹1,550   │
│  │ Product Card  │   │  Discount   -₹250   │
│  │ Product Card  │   │  ┌────────────────┐ │
│  └──────────────┘   │  │  PAY ₹1,300    │ │
│                      │  └────────────────┘ │
└──────────────────────┴──────────────────────┘
```

---

## 5. Navigation Structure

### 5.1 Primary Navigation (Role-Dependent)

#### Owner / Manager

| Icon | Label        | Route              | Children / Sub-pages                                           |
| ---- | ------------ | ------------------ | -------------------------------------------------------------- |
| 🏠   | Dashboard    | `/`                | —                                                              |
| 🛒   | POS          | `/pos`             | Billing, Held Bills, Returns                                   |
| 📦   | Inventory    | `/inventory`       | Products, Stock Overview, Adjustments, Audit, Barcodes/Labels  |
| 🛍️   | Purchases    | `/purchases`       | Purchase Orders, Goods Receipt, Purchase Returns               |
| 🏭   | Suppliers    | `/suppliers`       | Supplier List, Supplier Detail + Ledger, Record Payment        |
| 👥   | Customers    | `/customers`       | Customer List, Customer Detail + Khata, Record Payment         |
| 💰   | Accounting   | `/accounting`      | Sales, Expenses, GST, Cash Register, P&L                      |
| 📊   | Reports      | `/reports`         | All 17 report types                                            |
| 🔔   | Notifications| `/notifications`   | Notification list                                              |
| ⚙️   | Settings     | `/settings`        | Store, Users, Roles, Categories, Sizes, Thresholds, Templates  |

#### Salesperson

| Icon | Label        | Route              | Children                          |
| ---- | ------------ | ------------------ | --------------------------------- |
| 🏠   | Dashboard    | `/`                | —                                 |
| 🛒   | POS          | `/pos`             | Billing, My Held Bills            |
| 📦   | Products     | `/inventory`       | Product Search (view only)        |
| 👥   | Customers    | `/customers`       | Customer List, Create Customer    |
| 🏷️   | Labels       | `/labels`          | Print barcode labels              |

### 5.2 Mobile Bottom Tab Mapping

5 tabs max on mobile (thumb reachability). The 5th tab is "More" which opens a drawer/sheet.

**Owner/Manager:**
| Tab 1 | Tab 2 | Tab 3 | Tab 4 | Tab 5 |
|-------|-------|-------|-------|-------|
| Dashboard | Inventory | **POS** (center, prominent) | Customers | More (Purchases, Suppliers, Accounting, Reports, Settings) |

**Salesperson:**
| Tab 1 | Tab 2 | Tab 3 | Tab 4 | Tab 5 |
|-------|-------|-------|-------|-------|
| Dashboard | Products | **POS** (center, prominent) | Customers | Labels |

POS tab should be **visually prominent** — larger, colored, or elevated (FAB-style) since it's the most-used action.

---

## 6. Complete Screen Inventory

Total unique screens: **62**

### Phase Breakdown

| Phase | Screens | Focus | Goal |
| ----- | ------- | ----- | ---- |
| **Phase 1 (MVP)** | **28** | Login, Setup, Dashboard, POS + billing, Products CRUD, Bulk import, Stock overview, Barcode/labels, Direct purchase + history, Supplier CRUD + payments, Customer CRUD + khata, Cash register, Core settings | Ship a working store — billing, inventory, credit tracking |
| **Phase 2** | **17** | PO management, Purchase returns, Stock adjustments + audit, Sales overview, GST dashboard + returns + ITC, Expenses, P&L, Reports hub + viewer, Audit log | Full accounting, reports, and advanced inventory |
| **Phase 3** | **8** | OTP, Held bills, Returns & exchanges, Label template designer, Notification center, Threshold settings, Template settings, Offline POS | Refinements, alerts, returns workflow, offline |
| **Phase 4** | **7** | Tenant signup, Super admin (3 screens), remaining settings | SaaS productization |

> **Phase 1 ships 28 screens — enough for a fully functional store.** Every screen after that adds depth, not breadth.

### 6.1 Authentication & Onboarding (6 screens)

| #  | Screen                    | Route                    | Phase | Access     | Description                                         |
| -- | ------------------------- | ------------------------ | ----- | ---------- | --------------------------------------------------- |
| 1  | Login                     | `/login`                 | 1     | Public     | Email/phone + password. Link to forgot password     |
| 2  | OTP Verification          | `/verify-otp`            | 3     | Public     | 6-digit OTP input after login (if OTP enabled)      |
| 3  | Forgot Password           | `/forgot-password`       | 1     | Public     | Enter email/phone → sends reset link/OTP            |
| 4  | Reset Password            | `/reset-password`        | 1     | Public     | New password + confirm                              |
| 5  | Tenant Sign-up            | `/signup`                | 4     | Public     | Business name, owner details, plan selection (SaaS) |
| 6  | Setup Wizard              | `/setup`                 | 1     | Owner      | Multi-step: store details → GST scheme → team. Progress stepper at top |

### 6.2 Dashboard (2 screens)

| #  | Screen                    | Route                    | Phase | Access            | Description                                   |
| -- | ------------------------- | ------------------------ | ----- | ----------------- | --------------------------------------------- |
| 7  | Owner/Manager Dashboard   | `/`                      | 1     | Owner, Manager    | Widget grid: today's sales, profit, cash, receivables, payables, low stock, aging, top sellers, recent bills, payments due |
| 8  | Salesperson Dashboard     | `/`                      | 1     | Salesperson       | My sales today, my cash register, quick-bill button, recent my bills |

### 6.3 Point of Sale — POS (8 screens)

| #  | Screen                    | Route                    | Phase | Access            | Description                                   |
| -- | ------------------------- | ------------------------ | ----- | ----------------- | --------------------------------------------- |
| 9  | POS Billing               | `/pos`                   | 1     | All               | **Core screen.** Scan/search bar at top. Cart list. Discount inputs. Total bar. Pay button. Full-screen on all devices |
| 10 | Payment Modal             | `/pos` (modal)           | 1     | All               | Split payment: Cash / UPI / Card amount fields. Customer select. Credit option. Confirm button |
| 11 | Customer Quick-Add        | `/pos` (modal)           | 1     | All               | Name + Phone fields. Inline creation during billing |
| 12 | Bill Preview              | `/pos/bill/:id`          | 1     | All               | Print-ready bill view (Tax Invoice or Bill of Supply). Print / Share / WhatsApp buttons |
| 13 | Held Bills List           | `/pos/held`              | 3     | All               | List of parked bills with customer name, item count, time. Tap to resume |
| 14 | Returns & Exchanges       | `/pos/returns`           | 3     | Owner, Manager    | Bill lookup (scan/search). Select items to return. Return reason. Refund mode selector. Exchange flow |
| 15 | Bill History / Search     | `/pos/bills`             | 1     | Owner, Manager    | Searchable list of all bills. Filters: date, customer, salesperson, payment mode. Tap for detail |
| 16 | Bill Detail               | `/pos/bills/:id`         | 1     | Owner, Manager    | Full bill with all line items, discounts, payment breakdown. Reprint / Return buttons |

### 6.4 Products & Inventory (10 screens)

| #  | Screen                    | Route                      | Phase | Access         | Description                                   |
| -- | ------------------------- | -------------------------- | ----- | -------------- | --------------------------------------------- |
| 17 | Product List              | `/inventory/products`      | 1     | Owner, Manager | Filterable/searchable list. Filters: category, brand, stock status. Grid or list toggle. Sort by name/stock/price |
| 18 | Product Detail            | `/inventory/products/:id`  | 1     | Owner, Manager | All product info. Stock qty. Price history. Supplier history. Edit button |
| 19 | Product Create / Edit     | `/inventory/products/new`  | 1     | Owner, Manager | Form: name, category, sub-type, brand, size system, sizes, SKU, HSN, cost price, selling price, MRP, GST rate, min stock level, images |
| 20 | Product View (Salesperson)| `/inventory/products/:id`  | 1     | Salesperson    | Same as #18 but **cost price hidden**         |
| 21 | Bulk Import               | `/inventory/import`        | 1     | Owner, Manager | Upload CSV/Excel. Preview parsed rows. Validation errors inline. Confirm import |
| 22 | Stock Overview            | `/inventory/stock`         | 1     | Owner, Manager | All SKUs with current qty. Color-coded: green (healthy), amber (low), red (out). Filters: category, status |
| 23 | Stock Adjustment          | `/inventory/stock/adjust`  | 2     | Owner, Manager | Select product → qty change (+/-) → reason code dropdown → notes → submit |
| 24 | Stock Audit               | `/inventory/stock/audit`   | 2     | Owner, Manager | Select category/products → enter counted qty → system shows expected vs counted → variance report → approve adjustments |
| 25 | Barcode / Label Manager   | `/inventory/labels`        | 1     | All            | Select products → set qty of labels per product → choose template → preview → print |
| 26 | Label Template Designer   | `/inventory/labels/design` | 3     | Owner, Manager | Drag/drop fields (barcode, name, size, price, SKU) onto label canvas. Set label dimensions. Save template |

### 6.5 Purchase Management (6 screens)

| #  | Screen                    | Route                      | Phase | Access         | Description                                   |
| -- | ------------------------- | -------------------------- | ----- | -------------- | --------------------------------------------- |
| 27 | Purchase Order List       | `/purchases/orders`        | 2     | Owner, Manager | List with status badges (Draft, Sent, Partial, Received, Cancelled). Filter by supplier, status, date |
| 28 | PO Create / Edit          | `/purchases/orders/new`    | 2     | Owner, Manager | Select supplier → add line items (product, qty, expected cost) → notes → save draft / send |
| 29 | PO Detail                 | `/purchases/orders/:id`    | 2     | Owner, Manager | Full PO view. Status timeline. Receive goods button. PDF export |
| 30 | Goods Receipt             | `/purchases/receive`       | 1     | Owner, Manager | Against PO or direct. Supplier, invoice #, invoice date. Line items with received qty, cost, GST. Upload invoice image |
| 31 | Purchase History          | `/purchases/history`       | 1     | Owner, Manager | All recorded purchases. Filter by supplier, date. Totals |
| 32 | Purchase Return           | `/purchases/returns/new`   | 2     | Owner, Manager | Select original purchase → items to return → qty → reason → submit |

### 6.6 Supplier Management (4 screens)

| #  | Screen                    | Route                      | Phase | Access         | Description                                   |
| -- | ------------------------- | -------------------------- | ----- | -------------- | --------------------------------------------- |
| 33 | Supplier List             | `/suppliers`               | 1     | Owner, Manager | Searchable list. Show: name, outstanding balance (red if overdue), phone. Quick-pay button |
| 34 | Supplier Detail / Profile | `/suppliers/:id`           | 1     | Owner, Manager | Contact info, GSTIN, payment terms. Tabs: Ledger, Products Supplied, Purchase History |
| 35 | Supplier Create / Edit    | `/suppliers/new`           | 1     | Owner, Manager | Form: name, contact person, phone, email, address, GSTIN, payment terms, notes |
| 36 | Supplier Payment          | `/suppliers/:id/pay`       | 1     | Owner, Manager | Record payment: amount, mode (cash/UPI/bank/cheque), reference number, date, notes |

### 6.7 Customer Management (4 screens)

| #  | Screen                    | Route                      | Phase | Access         | Description                                   |
| -- | ------------------------- | -------------------------- | ----- | -------------- | --------------------------------------------- |
| 37 | Customer List             | `/customers`               | 1     | Owner, Manager | Searchable by name/phone. Show: name, phone, outstanding balance. Filter: with balance / all |
| 38 | Customer Detail / Khata   | `/customers/:id`           | 1     | Owner, Manager | Profile info. **Khata ledger**: chronological list of sales, payments, returns. Running balance. Record Payment button. Send Reminder button |
| 39 | Customer Create / Edit    | `/customers/new`           | 1     | Owner, Manager, Salesperson | Form: name, phone, email (opt), address (opt) |
| 40 | Customer Payment          | `/customers/:id/pay`       | 1     | Owner, Manager | Record payment received: amount, mode, reference, date, notes |

### 6.8 Accounting & Finance (8 screens)

| #  | Screen                    | Route                      | Phase | Access         | Description                                   |
| -- | ------------------------- | -------------------------- | ----- | -------------- | --------------------------------------------- |
| 41 | Sales Overview            | `/accounting/sales`        | 2     | Owner, Manager | Daily/weekly/monthly sales charts. Period selector. Breakdown by category, brand, salesperson |
| 42 | GST Dashboard             | `/accounting/gst`          | 2     | Owner, Manager | Scheme indicator (Regular/Composition). Period selector. For Regular: output tax, ITC, net liability. For Composition: turnover and 1% tax. Links to individual return data views |
| 43 | GST Return Data View      | `/accounting/gst/:return`  | 2     | Owner, Manager | GSTR-1 / GSTR-3B / CMP-08 / GSTR-4 — tabular data ready for filing. Export button |
| 44 | ITC Register              | `/accounting/gst/itc`      | 2     | Owner (Regular only) | Purchase-wise ITC ledger: CGST, SGST, IGST. Matched vs unmatched with GSTR-2B |
| 45 | Expense List              | `/accounting/expenses`     | 2     | Owner, Manager | List of all expenses. Filter by category, date. Monthly totals |
| 46 | Expense Create / Edit     | `/accounting/expenses/new` | 2     | Owner, Manager | Form: date, category (dropdown), amount, description, recurring toggle, receipt image upload |
| 47 | Cash Register             | `/accounting/cash`         | 1     | Owner, Manager | Today's register: opening balance, line-by-line cash inflows/outflows, calculated balance. Close day button → enter counted cash → show discrepancy |
| 48 | Profit & Loss             | `/accounting/pnl`          | 2     | Owner          | Period selector. Revenue, COGS, gross profit, expenses breakdown, net profit. Bar/line charts. Drilldown by category |

### 6.9 Reports (2 screens — hub + viewer)

| #  | Screen                    | Route                      | Phase | Access         | Description                                   |
| -- | ------------------------- | -------------------------- | ----- | -------------- | --------------------------------------------- |
| 49 | Reports Hub               | `/reports`                 | 2     | Owner, Manager | Card grid of all 17 report types. Icon + title + one-liner. Tap to open |
| 50 | Report Viewer             | `/reports/:type`           | 2     | Owner, Manager | **Shared layout** for all reports: date range picker at top, filter bar, data table/chart, export (PDF/Excel) button, print button. The content/columns change per report type |

### 6.10 Notifications (1 screen)

| #  | Screen                    | Route                      | Phase | Access         | Description                                   |
| -- | ------------------------- | -------------------------- | ----- | -------------- | --------------------------------------------- |
| 51 | Notification Center       | `/notifications`           | 3     | All            | Chronological list. Unread badge count. Types: low stock, payment due, discrepancy, daily summary. Tap to navigate to relevant screen |

### 6.11 Audit Trail (1 screen)

| #  | Screen                    | Route                      | Phase | Access         | Description                                   |
| -- | ------------------------- | -------------------------- | ----- | -------------- | --------------------------------------------- |
| 52 | Activity Log              | `/audit`                   | 2     | Owner          | Filterable log: user, action type, entity, date range. Each entry shows: timestamp, user, action, entity, old → new value. Expandable rows |

### 6.12 Settings (7 screens)

| #  | Screen                    | Route                        | Phase | Access | Description                                   |
| -- | ------------------------- | ---------------------------- | ----- | ------ | --------------------------------------------- |
| 53 | Settings Hub              | `/settings`                  | 1     | Owner  | Card list of all setting sections              |
| 54 | Store Settings            | `/settings/store`            | 1     | Owner  | Store name, address, phone, logo upload, GSTIN, GST scheme toggle (Regular/Composition), financial year, invoice prefix |
| 55 | User Management           | `/settings/users`            | 1     | Owner  | List of users. Invite user button. Edit role. Deactivate. Reset password |
| 56 | User Create / Edit        | `/settings/users/new`        | 1     | Owner  | Name, phone, email, role (Owner/Manager/Salesperson), set temp password |
| 57 | Category & Size Management| `/settings/categories`       | 1     | Owner  | Manage product categories, sub-types, and size systems per category. Add/edit/reorder |
| 58 | Threshold Settings        | `/settings/thresholds`       | 3     | Owner  | Default low-stock threshold, aging threshold (days), return window (days), salesperson max discount (₹ or %) |
| 59 | Template Settings         | `/settings/templates`        | 3     | Owner  | Receipt template preview + customize (header/footer text). Label template selection |

### 6.13 Super Admin — SaaS (Phase 4) (3 screens)

| #  | Screen                    | Route                        | Phase | Access      | Description                                |
| -- | ------------------------- | ---------------------------- | ----- | ----------- | ------------------------------------------ |
| 60 | Admin Dashboard           | `/admin`                     | 4     | Super Admin | Total tenants, active users, revenue, growth chart |
| 61 | Tenant List               | `/admin/tenants`             | 4     | Super Admin | All tenants with status, plan, user count, last active |
| 62 | Tenant Detail             | `/admin/tenants/:id`         | 4     | Super Admin | Tenant info, usage stats, support actions (suspend, extend trial, etc.) |

---

## 7. Screen Specifications

Detailed specs for the highest-priority screens.

### 7.1 POS Billing Screen (`/pos`) — **Most Critical Screen**

**Goal:** Complete a 5-item bill in under 60 seconds.

#### Mobile Layout (top to bottom)

| Zone             | Behavior               | Content                                                   |
| ---------------- | ---------------------- | --------------------------------------------------------- |
| **Scan Bar**     | **Collapses on cart scroll-down**, re-appears on scroll-up or tap | Input field (auto-focused). Camera scan icon. Scan Mode toggle (see Section 7.1.1). Hold/Recall icons |
| **Cart**         | Fills all remaining vertical space (scrollable) | List of added items. Each row: product name + size, qty stepper (+/-), unit price, line total. Swipe-left to remove. Per-item discount shown as subline |
| **Totals + Pay** | Pinned to bottom       | Combined zone: Subtotal, discount summary (tap to edit additional discount via bottom sheet), **Net Payable** (large, bold, monospace), full-width "PAY ₹1,300" button |

**Layout principle:** Only two pinned zones (scan bar + totals/pay), both kept as compact as possible. The cart claims all remaining space. The collapsing scan bar reclaims more room during scrolling. **Constraint: a 5-item cart must be comfortably scrollable on a 360px-wide device without feeling cramped.**

```
┌─────────────────────────┐
│ 🔍 Scan / Search    📷 │  ← collapses on scroll-down
├─────────────────────────┤
│  Rupa RN Vest - L       │
│  1 × ₹350      ₹350    │
│  Jeans Slim - 32        │
│  1 × ₹1,200    ₹1,200  │
│   └ Discount: -15%      │
│  Socks Ankle - Free     │
│  2 × ₹150      ₹300    │
│         (scrollable)    │
├─────────────────────────┤
│ Subtotal ₹1,850         │
│ Discount -₹180  [edit]  │
│ ┌─────────────────────┐ │
│ │   PAY  ₹1,670      │ │  ← pinned to bottom
│ └─────────────────────┘ │
└─────────────────────────┘
```

#### Desktop Layout (side by side)

| Left Panel (60%)         | Right Panel (40%)            |
| ------------------------ | ---------------------------- |
| Search/scan input        | Cart item list (scrollable)  |
| Product search results   | Discount section             |
| OR category quick-browse | Totals section               |
|                          | Pay button                   |

#### Key Interactions

#### GST Scheme UI Adaptation

The POS screen adapts based on the tenant's GST scheme setting:

| Element                    | Regular GST                                      | Composition Scheme                               |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| Cart item rows             | May show HSN, taxable value columns (desktop)    | **No tax columns shown at all**                  |
| Totals section             | Can show tax summary (CGST + SGST) on expand     | **No tax breakdown** — just subtotal, discount, net payable |
| Bill Preview               | Tax Invoice header, full GST breakup per item    | Bill of Supply header + mandatory declaration: *"Composition taxable person, not eligible to collect tax on supplies"* |
| Payment Modal              | No change                                        | No change                                        |
| Additional discount sheet  | No change                                        | No change                                        |

This is driven by a single global flag (`tenant.gstScheme`) — no per-screen configuration needed.

#### Key Interactions

- **Barcode scan**: item instantly added to cart (qty 1). If already in cart, qty increments. Sound/haptic feedback
- **Search**: debounced (300ms). Results show: name, brand, size, price, stock qty. Tap to add
- **Qty edit**: stepper buttons (+/-). Long-press for manual number input
- **Additional discount**: tap opens bottom sheet with two options: enter flat ₹ amount OR percentage. Shows calculated result in real-time
- **Hold**: button in top bar → saves cart, clears POS, shows badge on Held Bills
- **Offline indicator**: amber banner at top: "You're offline. Bills will sync when connected."

#### 7.1.1 Scan Mode (Mobile Scanner Handling)

**Problem:** Mobile browsers treat a Bluetooth barcode scanner as a keyboard. The virtual on-screen keyboard pops up alongside the physical scanner input, obscuring the cart and disrupting the UI. Auto-detecting whether a physical scanner is connected is unreliable in mobile web browsers.

**Solution: Manual "Scan Mode" toggle**

- A toggle button on the POS scan bar: `[📷 Type]` ↔ `[⎸⎸⎸ Scan]`
- **Type Mode (default):** Normal text input. Virtual keyboard opens on focus. User types product name or SKU. Good for search-based item lookup
- **Scan Mode:** Input field is set to `readonly` with a hidden listener that captures rapid keystroke input from the scanner. Virtual keyboard is suppressed. A visual indicator shows "Scanner active — scan a barcode". Camera scan button also available as fallback
- The mode persists in `localStorage` — if a user always has a scanner, they set it once
- When in Scan Mode, tapping the input field does **not** open the virtual keyboard. To switch to typing, user taps the mode toggle
- On desktop, this toggle is hidden — desktop always accepts both scanner and keyboard input natively

**iOS WebKit Risk & Required PoC:**

iOS Safari (WebKit) is known to behave unpredictably with `readonly` focused inputs — it may still trigger screen zoom or occasionally show the keyboard. Some Bluetooth scanners also won't fire keystroke events into a `readonly` field.

**Before building the full POS UI, the dev team must build a one-page Proof of Concept** that tests:
1. `readonly` input + JS `keydown` listener with a Bluetooth scanner on **Android Chrome** and **iOS Safari**
2. Alternative approach if `readonly` fails on iOS: off-screen `<textarea>` positioned at `-9999px`, focused programmatically, capturing scanner input invisibly
3. Camera-based barcode scanning (using a JS library like `@AltspaceVR/quagga` or `html5-qrcode`) as the universal mobile fallback

The PoC results determine the final Scan Mode implementation. Do not commit to an approach without testing on real devices first.

### 7.2 Payment Modal

| Section               | Content                                                          |
| --------------------- | ---------------------------------------------------------------- |
| **Header**            | "Payment — ₹1,300" with close button                            |
| **Customer**          | Search existing (by phone) / Create new / Skip (walk-in)        |
| **Payment Split**     | Three rows: Cash [₹ input], UPI [₹ input], Card [₹ input]. Auto-fills remaining in first mode. Shows "Remaining: ₹0" when balanced |
| **Credit (Khata)**    | Toggle: "Add to customer credit?" — only if customer selected. Partial credit allowed (pay ₹800 now, ₹500 on credit) |
| **Confirm**           | "Complete Sale" button (disabled until amounts balance). On tap → generates bill → auto-print prompt |

### 7.3 Owner/Manager Dashboard (`/`)

**Layout:** Responsive card grid. 2 columns on mobile, 3 on tablet, 4 on desktop.

| Widget (top row — KPI cards) | Visual |
|-----|-----|
| Today's Sales: ₹24,500 (↑12% vs yesterday) | Large number, green/red arrow |
| Today's Profit: ₹6,200 | Large number |
| Cash-in-Hand: ₹18,300 | Large number |
| Outstanding Receivables: ₹1,45,000 | Large number, amber if > threshold |

| Widget (middle row — charts) | Visual |
|-----|-----|
| Payment Mode Split | Donut chart (Cash/UPI/Card) |
| Sales Trend (7 days) | Mini line/bar chart |

| Widget (bottom row — action lists) | Visual |
|-----|-----|
| Low Stock Alerts (5) | List with amber/red indicators. Tap → product |
| Supplier Payments Due (3) | List with due dates. Tap → supplier |
| Recent Bills | Compact list: bill #, time, amount. Tap → detail |

### 7.4 Customer Khata Screen (`/customers/:id`)

| Section            | Content                                                               |
| ------------------ | --------------------------------------------------------------------- |
| **Header Card**    | Customer name, phone, total outstanding balance (large, red if > 0)   |
| **Action Buttons** | "Record Payment" (primary), "Send Reminder" (secondary)              |
| **Ledger Tab**     | Chronological list: date, description (sale/payment/return), debit, credit, running balance. Infinite scroll. Filter by date range |
| **Purchase Tab**   | All bills for this customer. Tap → bill detail                       |
| **Summary**        | Aging breakdown: < 30 days, 30-60 days, 60-90 days, > 90 days       |

### 7.5 Supplier Ledger Screen (`/suppliers/:id`)

Same pattern as customer khata but with:
- Outstanding balance = amount you owe (shown as payable)
- Ledger entries: purchases (debit), payments made (credit), returns (credit)
- Payment due dates highlighted with overdue badges

### 7.6 Stock Overview (`/inventory/stock`)

| Element          | Description                                                          |
| ---------------- | -------------------------------------------------------------------- |
| **Filter Bar**   | Category dropdown, Brand dropdown, Stock Status (All / Low / Out / Healthy), Search |
| **Summary Cards**| Total SKUs: 1,970 | In Stock: 1,650 | Low Stock: 180 | Out of Stock: 140 |
| **Table**        | Columns: Product Name, SKU, Brand, Size, Qty, Min Level, Status (badge), Age (days). Sortable. Color-coded rows |
| **Status Badges**| Green "In Stock" / Amber "Low" / Red "Out" / Purple "Aging"         |

### 7.7 Setup Wizard (`/setup`)

Multi-step form with progress stepper.

The wizard must get the user to a working dashboard as fast as possible. Only 3 mandatory steps. Everything else happens at their own pace from the dashboard.

| Step | Title              | Required? | Fields                                                                |
| ---- | ------------------ | --------- | --------------------------------------------------------------------- |
| 1    | Store Details      | **Yes**   | Store name, address, phone, email, logo upload                        |
| 2    | GST Configuration  | **Yes**   | GSTIN, GST Scheme (Regular / Composition — with explanation cards for each), Financial year start month |
| 3    | Team               | **Yes**   | At minimum, owner account is created. Optionally invite staff: name, phone, role. "I'll add later" allowed |
| ✅   | Ready!            | —         | Summary card. "Go to Dashboard" button                                |

**Post-wizard "Getting Started" checklist** — shown as a prominent card on the dashboard until all items are completed or dismissed:

| Checklist Item             | Links to                    | Why deferred                                     |
| -------------------------- | --------------------------- | ------------------------------------------------ |
| Set up product categories  | `/settings/categories`      | Can use defaults, customize later                |
| Add your first products    | `/inventory/products/new` or `/inventory/import` | 1,500–2,500 SKUs is a multi-day effort — don't block onboarding |
| Enter opening stock        | `/inventory/stock/audit`    | Requires physical count                          |
| Import customer balances   | `/customers` (bulk import)  | Notebook migration at own pace                   |
| Import supplier balances   | `/suppliers` (bulk import)  | Notebook migration at own pace                   |
| Print your first barcode   | `/inventory/labels`         | Quick win to motivate adoption                   |
| Create a test bill         | `/pos`                      | Hands-on learning                                |

Each item shows a checkmark when done. The checklist can be dismissed permanently via "I'm all set" link.

---

## 8. Shared Components

Reusable components that appear across multiple screens.

### 8.1 Data Display

| Component            | Usage                                              | Behavior                                  |
| -------------------- | -------------------------------------------------- | ----------------------------------------- |
| **Data Table**       | Product list, bill history, ledger, reports        | Sortable columns, sticky header, row click → detail. Mobile: card list instead of table |
| **KPI Card**         | Dashboard widgets                                  | Icon, label, large number, comparison arrow/percentage |
| **Status Badge**     | Stock status, PO status, payment status            | Colored pill: green/amber/red/blue/purple with text |
| **Amount Display**   | All monetary values                                | Monospace font, right-aligned, ₹ prefix, Indian numbering |
| **Empty State**      | Any list with no data                              | Illustration + message + CTA button ("Add your first product") |
| **Ledger Row**       | Customer/Supplier ledger entries                   | Date, description, debit (red), credit (green), balance |

### 8.2 Input & Forms

| Component            | Usage                                              | Behavior                                  |
| -------------------- | -------------------------------------------------- | ----------------------------------------- |
| **Search Input**     | POS, product list, customer/supplier search        | Debounced (300ms), clear button, barcode scan icon on mobile |
| **Scanner Input**    | POS scan bar, stock audit                          | Has **Scan Mode toggle** (see 7.1.1): Scan Mode uses `readonly` + hidden JS listener to suppress virtual keyboard; Type Mode uses normal input. Auto-submit on Enter. Visual flash on successful scan |
| **Qty Stepper**      | POS cart, stock adjustment                         | +/- buttons, tap center to type. Min 0     |
| **Date Range Picker**| Reports, ledger filters                            | Presets: Today, Yesterday, This Week, This Month, This Quarter, This FY, Custom |
| **Multi-Select Filter** | Category, brand, status filters                 | Dropdown with checkboxes, "Apply" button, pill tags showing active filters |
| **Currency Input**   | Payment, pricing, expense                          | ₹ prefix, auto-comma formatting, numeric keyboard on mobile |
| **Image Upload**     | Product images, receipt images, supplier invoices  | Drag-drop on desktop, camera/gallery on mobile, preview thumbnail |
| **Form Stepper**     | Setup wizard, PO creation                          | Horizontal step indicators, back/next buttons |

### 8.3 Feedback & Overlays

| Component            | Usage                                              | Behavior                                  |
| -------------------- | -------------------------------------------------- | ----------------------------------------- |
| **Toast**            | Success/error messages (bill saved, payment recorded) | Auto-dismiss 3s (success) / persist until dismissed (error). Bottom of screen on mobile, top-right on desktop |
| **Bottom Sheet**     | Additional discount, filters on mobile, payment options | Slide-up modal. Drag handle. 50% or full screen |
| **Confirm Dialog**   | Delete product, void bill, stock write-off         | Title, message, Cancel + Destructive action button (red) |
| **Loading Skeleton** | All data screens during fetch                      | Animated placeholder blocks matching content layout |
| **Offline Banner**   | POS, any data screen                               | Persistent amber banner at top: "Offline — changes will sync when connected" |
| **Sync Indicator**   | After reconnect (success)                          | Green checkmark toast: "3 bills synced successfully" |
| **Sync Conflict Modal** | After reconnect (failures)                      | See Section 8.3.1 below |

#### 8.3.1 Sync Conflict Resolution UI

When offline bills sync back to the server, some may fail — e.g., a product was deleted by the manager while a salesperson sold it offline, or a supplier invoice reference is rejected.

**Sync states and their UI:**

| State | UI | Who sees it |
| ----- | -- | ----------- |
| **All synced** | Green toast: "3 bills synced successfully" → auto-dismiss | Salesperson who was offline |
| **Partial failure** | Amber toast (persistent): "2 bills synced, 1 needs review" → tapping opens Sync Conflicts screen | Salesperson + Owner/Manager |
| **All failed** | Red toast (persistent): "3 bills could not sync — tap to review" | Salesperson + Owner/Manager |

**Sync Conflicts Screen** (`/pos/sync-conflicts`):

- List of failed transactions with: bill timestamp, items, total amount, failure reason (e.g., "Product MVT-RPA-RN-L-001 no longer exists", "Negative stock on 2 items")
- Each conflict shows the offline bill details and the server-side issue
- **Resolution actions per conflict** (Owner/Manager only):
  - **Force accept**: override the server issue and accept the bill as-is (e.g., create the stock discrepancy, re-add the product)
  - **Edit & retry**: modify the bill (e.g., swap the deleted product for its replacement SKU) and re-sync
  - **Void**: discard the offline bill entirely (with reason — should be rare, since the physical sale happened)
- Salesperson sees the conflicts but cannot resolve them — shown a message: "Your manager needs to review this"
- **Dashboard badge**: a red badge appears on the POS nav item and on the Owner/Manager dashboard when unresolved sync conflicts exist, until all are resolved

### 8.4 Navigation

| Component            | Usage                                              | Behavior                                  |
| -------------------- | -------------------------------------------------- | ----------------------------------------- |
| **Bottom Tab Bar**   | Mobile primary navigation                          | 5 tabs max. POS tab visually prominent. Unread badge on Notifications |
| **Sidebar**          | Desktop primary navigation                         | Collapsible. Logo at top. User avatar + role at bottom. Active state highlight |
| **Breadcrumb**       | Desktop sub-page navigation                        | e.g., Inventory > Products > Rupa RN Vest |
| **Top Bar (mobile)** | Page title + action icons                          | Title left-aligned. Icons right: notification bell (with badge), user avatar |

---

## 9. Iconography & Visual Language

### 9.1 Icon System

Use a single consistent icon set. **Recommended: Lucide Icons** (open source, clean, consistent stroke width, React/Vue friendly).

| Category        | Icons Needed                                                    |
| --------------- | --------------------------------------------------------------- |
| Navigation      | Home, Package, ShoppingCart, Users, Truck, Building, BarChart, Settings, Bell, Menu |
| POS             | ScanBarcode, Search, Plus, Minus, Trash2, CreditCard, Banknote, Smartphone (UPI), Pause (hold), RotateCcw (return) |
| Status          | CheckCircle, AlertTriangle, XCircle, Clock, TrendingUp, TrendingDown |
| Actions         | Plus, Edit, Trash, Download, Printer, Share, Send, Eye, EyeOff  |
| Finance         | IndianRupee, Receipt, FileText, Calculator, PiggyBank           |

### 9.2 Status Visual Language

Consistent color + icon pairing across the entire app:

| Status              | Color        | Icon            | Examples                              |
| ------------------- | ------------ | --------------- | ------------------------------------- |
| Healthy / Paid      | `success`    | CheckCircle     | In stock, payment received, synced    |
| Warning / Low       | `warning`    | AlertTriangle   | Low stock, payment due soon, aging    |
| Critical / Overdue  | `error`      | XCircle         | Out of stock, overdue, offline        |
| Info / Neutral      | `info`       | Info            | New, pending, draft PO               |
| Aging / Slow        | `primary`    | Clock           | Inventory sitting > threshold         |

### 9.3 Micro-Interactions

| Interaction          | Feedback                                                    |
| -------------------- | ----------------------------------------------------------- |
| Barcode scan success | Brief green flash on scan input + item slides into cart     |
| Item added to cart   | Cart count badge bounces                                    |
| Bill completed       | Checkmark animation + haptic (mobile)                       |
| Payment received     | Amount briefly highlights green                             |
| Delete / void        | Item fades out with slight slide                            |
| Offline → Online     | Banner transitions from amber to green, then auto-dismisses |
| Error                | Shake animation on the errored field/element                |

---

## 10. Accessibility

| Requirement             | Implementation                                                     |
| ----------------------- | ------------------------------------------------------------------ |
| **Color contrast**      | All text meets WCAG 2.1 AA (4.5:1 body, 3:1 large text). Never use color alone for status — always pair with icon/text |
| **Focus management**    | Visible focus rings on all interactive elements. Logical tab order  |
| **Screen readers**      | All icons have `aria-label`. Form fields have proper `<label>`. Status badges have `aria-live` for updates |
| **Touch targets**       | Minimum 44x44px for all tappable elements                          |
| **Keyboard navigation** | Full keyboard support for POS (Enter to add item, Tab through cart, shortcut keys for Pay / Hold / Search) |
| **Reduced motion**      | Respect `prefers-reduced-motion`. Disable animations if set        |
| **Font scaling**        | UI must remain usable up to 150% browser zoom                      |

### POS Keyboard Shortcuts (Desktop)

| Shortcut      | Action                    |
| ------------- | ------------------------- |
| `F1`          | Focus scan/search bar     |
| `F2`          | Open payment modal        |
| `F3`          | Hold current bill         |
| `F4`          | Recall held bills         |
| `F8`          | Apply additional discount |
| `Esc`         | Cancel / close modal      |
| `Ctrl+P`      | Print last bill           |

**Important:** All POS shortcuts (F1–F8) must be **suppressed when any text input field is focused** (e.g., search bar, qty field, discount input). Shortcuts should only fire when focus is on the POS screen body or a non-text element. This prevents accidental triggers while typing. `Esc` and `Ctrl+P` may remain active regardless of focus.

---

*End of Document*

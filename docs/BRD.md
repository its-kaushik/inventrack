# Business Requirements Document (BRD)

## InvenTrack — Retail Inventory & Accounting Management System

| Field            | Detail                                      |
| ---------------- | ------------------------------------------- |
| **Document Version** | 1.0                                     |
| **Date**         | 2026-03-29                                  |
| **Author**       | Kaushik (Owner, Kaushik Vastra Bhandar)     |
| **Status**       | Draft                                       |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Context](#2-business-context)
3. [Product Categories & SKU Model](#3-product-categories--sku-model)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [User Roles & Permissions](#6-user-roles--permissions)
7. [Multi-Tenancy & SaaS Architecture](#7-multi-tenancy--saas-architecture)
8. [Integrations](#8-integrations)
9. [Data Migration](#9-data-migration)
10. [Phased Delivery Plan](#10-phased-delivery-plan)
11. [Glossary](#11-glossary)

---

## 1. Executive Summary

**InvenTrack** is a mobile-first web application for retail store inventory management and accounting. It will serve as the complete digital backbone for **Kaushik Vastra Bhandar** — a single-location clothing and accessories store — replacing manual notebook-based record-keeping.

The system must be **multi-tenant from day one**, enabling future commercialization as a SaaS product for other retail businesses.

### Core Objectives

- Digitize all inventory tracking with barcode-based identification
- Provide a fast, scanner-enabled POS (Point of Sale) for billing
- Track all purchases, sales, credits (supplier & customer), and expenses
- Generate GST-compliant invoices and financial reports
- Alert on low stock and aging (slow-moving) inventory
- Support barcode label generation and printing
- Enable future online store integration

---

## 2. Business Context

### 2.1 Current State

| Aspect              | Current                                           |
| ------------------- | ------------------------------------------------- |
| Store               | Single location, in-store sales only              |
| Staff               | 3–4 salespeople + owner/manager                   |
| Record keeping      | Paper notebooks for customer/supplier credits      |
| Billing             | No printed bills issued                           |
| Barcodes            | None — products identified manually               |
| Inventory tracking  | Mental / manual                                   |
| Accounting          | Manual                                            |
| Suppliers           | 50+ suppliers, some on credit                     |
| GST                 | Filed, but GST is inclusive in selling price       |

### 2.2 Pain Points

1. No visibility into current stock levels
2. No way to identify slow-moving inventory
3. Customer and supplier credit tracking is error-prone on paper
4. No profit/loss visibility per product or overall
5. Billing is slow and unprofessional (no printed receipts)
6. Cannot detect theft or stock discrepancies
7. No data-driven purchasing decisions

### 2.3 Success Criteria

- All products barcoded and scannable within the first month of deployment
- Billing time reduced to under 2 minutes per transaction
- Real-time stock visibility across all categories
- Accurate customer/supplier credit ledgers replacing notebooks
- Monthly P&L reports generated automatically
- System usable on mobile phones at the shop counter

---

## 3. Product Categories & SKU Model

### 3.1 Category Hierarchy

The store carries **16 top-level categories**. Each product is identified by a unique SKU derived from its category, brand, type/sub-type, and size.

| #  | Category                       | Sub-types / Variants (examples)                        | Size Systems Used          |
| -- | ------------------------------ | ------------------------------------------------------ | -------------------------- |
| 1  | Men's Vests                    | RN, RNS, Sports/Gym                                   | XS, S, M, L, XL, XXL ...  |
| 2  | Men's Underwear                | Boxer, French Cut, Brief, Trunk                        | XS, S, M, L, XL, XXL ...  |
| 3  | Socks                          | Ankle, Crew, No-show, Sports                           | Free size / Numbered       |
| 4  | Jeans                          | Slim, Regular, Straight                                | 28, 30, 32, 34, 36, 38    |
| 5  | Shirts                         | Formal, Casual, Party wear                             | 38, 40, 42, 44             |
| 6  | Kids Wear                      | T-shirt & Shorts Combo, 3-Piece Party Wear Suits, etc.| Age-based (2-3Y, 4-5Y) / Numbered (0, 10, 11, 12) |
| 7  | Ethnic Wear (Men)              | Kurta, Kurta-Pyjama Set, Nehru Jacket                  | S, M, L, XL, XXL          |
| 8  | Blazers & Suits (Men)          | 2-Piece Suit, 3-Piece Suit, Blazer                     | 38, 40, 42, 44             |
| 9  | Ladies Suits (Stitched)        | Salwar Kameez, Anarkali, Palazzo Set                   | S, M, L, XL, XXL          |
| 10 | Girls Wear                     | Frock, Lehenga Choli, Top-Skirt Set                    | Age-based / Numbered       |
| 11 | Ladies Suit Unstitched Fabric  | Cotton, Silk, Georgette, Lawn                          | N/A (sold by piece/set)    |
| 12 | Sarees                         | Silk, Cotton, Georgette, Banarasi, Printed              | N/A (free size)            |
| 13 | Lehengas                       | Bridal, Party wear, Semi-stitched                      | S, M, L, XL, XXL / Custom |
| 14 | Bags                           | School Bag, Luggage, Laptop Bag, Handbag               | N/A (model-based)          |
| 15 | Deodorants                     | Body Spray, Perfume, Roll-on                           | N/A (by volume/brand)      |
| 16 | Other                          | Catch-all for future categories                        | Varies                     |

### 3.2 SKU Structure

Each unique product variant (combination of category + brand + type + size + color) gets its own SKU.

**SKU format:** `{CATEGORY_CODE}-{BRAND_CODE}-{TYPE_CODE}-{SIZE}-{SEQUENCE}`

Example: `MVT-RPA-RN-L-001` = Men's Vest → Rupa → RN → Large → Item 001

### 3.3 SKU Count Estimate

| Category                      | Brands | Types | Sizes | Est. SKUs |
| ----------------------------- | ------ | ----- | ----- | --------- |
| Men's Vests                   | 10     | 3     | 6     | ~180      |
| Men's Underwear               | 10     | 4     | 6     | ~240      |
| Socks                         | 10     | 4     | 3     | ~120      |
| Jeans                         | 10     | 3     | 6     | ~180      |
| Shirts                        | 10     | 3     | 4     | ~120      |
| Kids Wear                     | 10     | 5     | 5     | ~250      |
| Ethnic Wear                   | 10     | 3     | 5     | ~150      |
| Blazers & Suits               | 10     | 3     | 4     | ~120      |
| Ladies Suits                  | 10     | 3     | 5     | ~150      |
| Girls Wear                    | 10     | 3     | 5     | ~150      |
| Unstitched Fabric             | 10     | 4     | 1     | ~40       |
| Sarees                        | 10     | 5     | 1     | ~50       |
| Lehengas                      | 10     | 3     | 5     | ~150      |
| Bags                          | 10     | 4     | 1     | ~40       |
| Deodorants                    | 10     | 3     | 1     | ~30       |
| **Total**                     |        |       |       | **~1,970**|

**Estimated active SKUs: 1,500 – 2,500** (varies seasonally).

The system must be designed to handle **10,000+ SKUs per tenant** comfortably for SaaS scalability.

---

## 4. Functional Requirements

### 4.1 Product & Inventory Management

#### FR-4.1.1: Product Catalog

- Create, edit, and archive products
- Each product has: name, category, sub-type, brand, SKU (auto-generated or manual), HSN code, GST rate, selling price, cost price, MRP (if applicable), description, images (optional)
- Support **multiple size systems** per category (letter-based, number-based, age-based, free-size)
- Support **color variants** as separate SKUs
- Track **last purchase price per supplier** per product (for reordering reference)
- Bulk product import via CSV/Excel upload
- Product search by name, SKU, brand, category, or barcode

#### FR-4.1.2: Stock Management

- Track quantity per SKU per location (single store now; multi-store per tenant later)
- Record stock-in (from purchase) and stock-out (from sale, return-to-supplier, damage/write-off)
- **Stock adjustment** entries with reason codes (damage, theft, count correction)
- Physical stock count / audit feature with variance report
- **Aging tracking**: record the date each unit entered inventory; flag items sitting beyond a configurable threshold (e.g., 90 days, 180 days) as slow-moving
- Average cost price calculation for profit computation

#### FR-4.1.3: Low Stock Alerts

- Configurable minimum stock level **per SKU**
- Dashboard widget showing items below minimum stock
- Push notification / in-app alert when stock falls below threshold
- Suggested reorder quantity (based on configurable reorder point)

#### FR-4.1.4: Barcode & Label Management

- **Barcode generation**: auto-generate barcodes (Code-128 or EAN-13) for each SKU
- **Label designer**: configurable label templates with fields — barcode, product name, size, price, SKU code
- **Batch label printing**: select products/quantities → generate printable label sheets (support for common label printers: thermal label printers, A4 sheet label formats)
- **Barcode scanner input**: anywhere a product field exists, support input from USB/Bluetooth barcode scanners (scanners send keyboard input — system must handle rapid keystroke input and auto-submit)

---

### 4.2 Point of Sale (POS)

#### FR-4.2.1: Billing Screen

- Mobile-first, fast, minimal-tap billing interface
- Add items by: **barcode scan** (primary), manual SKU entry, product name search
- Display: item name, size, qty, unit price, line total
- Edit quantity, remove items from cart
- **Discount handling (three tiers)**:
  - **Catalog discount %**: default discount percentage set per product (e.g., 15% off)
  - **Additional discount (bargain adjustment)**: flat amount or percentage knocked off after catalog discount (e.g., customer bargains 1750 down to 1500 → Rs.250 additional discount)
  - Both discounts recorded separately for analytics
- **Salesperson discount limit**: owner/manager configures max additional discount a salesperson can apply (flat amount or %). Beyond this limit, manager/owner approval is required
- Cart total, discount summary, net payable — all visible in real-time
- **Hold & recall**: park a bill (e.g., customer goes to try something) and resume later
- Support for **mixed payment**: split across Cash + UPI + Card in a single transaction
- **Auto-generated bill numbers**: sequential, with configurable prefix (e.g., `KVB-2026-00001`), financial year aware, unique per tenant
- Generate and print bill / receipt (thermal printer support)
- **Invoice type auto-selected based on GST scheme**:
  - **Regular GST** → **Tax Invoice**: store name, address, GSTIN, phone | bill number, date, time, salesperson | itemized list (name, HSN, size, qty, unit price, discount, taxable value, CGST, SGST, line total) | subtotal, catalog discount, additional discount, tax summary, net payable | payment mode breakdown | return/exchange policy footer | barcode of bill number for easy lookup
  - **Composition Scheme** → **Bill of Supply**: same as above but **no GST breakup columns**, and mandatory header declaration: *"Composition taxable person, not eligible to collect tax on supplies"*
  - For B2C sales under Regular GST where GST is inclusive, the detailed tax breakup can be shown in a summary section at the bottom rather than per line item (configurable)
- Option to email/WhatsApp bill to customer

#### FR-4.2.2: Returns & Exchanges

- Process returns against an original bill (lookup by bill number, date, or bill barcode scan)
- **Refund value is always based on the original bill**: the system fetches the exact line-item price, catalog discount, and additional discount from the original transaction — never the current master price. If an item was sold at Rs.1500 after bargaining, the refund is Rs.1500, regardless of today's price
- Full return (refund) or exchange (adjust against new items)
- For **exchanges**: returned items are credited at original bill value; new items are billed at current prices. The customer pays/receives the difference
- Returned items auto-added back to inventory (stock-in with return reason)
- Track return reason (size issue, defect, customer changed mind, etc.)
- Configurable **return window** (e.g., 7 days, 15 days, no limit) — system warns if return is attempted outside the window, but owner/manager can override
- Refund modes: cash, credit note (store credit), or adjustment in exchange
- All returns linked to original bill for audit trail

#### FR-4.2.3: Daily Cash Register

- **Opening balance**: salesperson enters cash-in-hand at shift start
- Track all cash inflows (cash sales, credit collections) and outflows (petty cash expenses, cash paid to supplier)
- **Closing balance**: calculated vs actual count — highlight discrepancy
- End-of-day register summary report
- Per-salesperson register tracking

---

### 4.3 Purchase Management

#### FR-4.3.1: Purchase Orders (PO)

- Create PO for a supplier with line items (product, qty, expected cost)
- PO statuses: Draft → Sent → Partially Received → Fully Received → Cancelled
- Email/share PO as PDF to supplier
- Track PO history per supplier

#### FR-4.3.2: Purchase Recording (Goods Receipt)

- Record purchase against a PO, or as a **direct purchase** (without prior PO)
- Enter: supplier, invoice number, invoice date, items received (product, qty, cost price, GST details)
- Auto-update inventory on recording
- Support partial delivery against a PO
- Upload supplier invoice image/PDF for reference

#### FR-4.3.3: Purchase Returns

- Record items returned to supplier
- Adjust inventory and supplier balance accordingly
- Link to original purchase record

---

### 4.4 Supplier Management

#### FR-4.4.1: Supplier Directory

- Supplier profile: name, contact person, phone, email, address, GSTIN, payment terms
- Supplier-wise product catalog (which supplier provides which products)
- Supplier performance notes (optional)

#### FR-4.4.2: Supplier Credit (Payables) Tracking

- Track outstanding balance per supplier
- Record payments (full or partial) against outstanding balance
- Payment due date tracking with overdue alerts
- Supplier ledger: full transaction history (purchases, payments, returns, adjustments)
- Support multiple payment modes: cash, UPI, bank transfer, cheque

---

### 4.5 Customer Management

#### FR-4.5.1: Customer Directory

- Customer profile: name, phone number (primary identifier), email (optional), address (optional)
- Quick customer creation during billing (name + phone minimum)
- Walk-in / anonymous customer support (no customer record required for cash sales)

#### FR-4.5.2: Customer Credit (Khata) Tracking

- Track outstanding balance per customer (no interest, no credit limit)
- Record credit sales (full or partial credit on a bill)
- Record payments received against outstanding balance
- Customer ledger: full transaction history (sales, payments, returns, adjustments)
- Khata summary dashboard: total outstanding, aging breakdown
- Option to send payment reminder via WhatsApp/SMS

---

### 4.6 Accounting & Finance

#### FR-4.6.1: Sales Tracking

- Record every sale with: date, time, customer (if any), items, quantities, unit prices, catalog discount, additional (bargain) discount, net amount, payment mode(s), salesperson
- Daily, weekly, monthly, yearly sales summaries
- Sales by category, brand, product, salesperson

#### FR-4.6.2: GST Management

The system must support **two GST registration types**, selectable during tenant setup:

##### A. Regular GST Scheme

- GST is **inclusive** in selling price (no separate GST line on B2C customer bill by default)
- Store HSN codes and GST rates per product (clothing ≤ Rs.1000 = 5%, clothing > Rs.1000 = 12%, etc.)
- Back-calculate GST components (CGST + SGST for intra-state, IGST for inter-state) from inclusive selling price
- **Input Tax Credit (ITC) tracking**: capture GST paid on purchases (from supplier invoices) — maintain ITC ledger for CGST, SGST, IGST separately
- **ITC reconciliation**: match ITC claimed against GSTR-2A/2B auto-populated data
- **Reverse Charge Mechanism (RCM)**: track purchases attracting RCM, calculate and record RCM liability, claim as ITC
- Issue **Tax Invoice** with full GST breakup (GSTIN, HSN, rate-wise CGST/SGST/IGST amounts)
- Inter-state sales allowed
- E-commerce sales allowed
- **Returns to file**: GSTR-1 (outward supplies — monthly or quarterly under QRMP), GSTR-3B (summary + tax payment — monthly or quarterly), GSTR-9 (annual)
- **GST reports**: GSTR-1 data, GSTR-3B summary (output tax − input tax credit = net liability), HSN-wise summary, ITC register, GSTR-2B reconciliation, rate-wise tax summary

##### B. Composition Scheme (Section 10, CGST Act)

- Eligibility: aggregate turnover up to **Rs.1.5 crore** (Rs.75 lakh for special category states)
- **Flat tax rate**: 1% of turnover (0.5% CGST + 0.5% SGST) for traders/dealers — NOT per-item rate
- **No GST collected from customer** — tax is paid from the dealer's own margin
- **No Input Tax Credit (ITC)** — GST paid on purchases is absorbed into cost of goods (ITC ledger disabled)
- Issue **Bill of Supply** (NOT Tax Invoice) — must prominently display: *"Composition taxable person, not eligible to collect tax on supplies"*
- Bill of Supply must NOT show any GST breakup (no CGST/SGST/IGST columns)
- **Inter-state outward supplies NOT allowed** — system must block/warn if attempting inter-state sale
- **E-commerce marketplace sales NOT allowed** — system must warn if e-commerce integration is attempted
- Purchases from other states allowed (supplier charges IGST, absorbed into cost)
- RCM liability must still be paid, but **NOT claimable as ITC**
- **Returns to file**: CMP-08 (quarterly statement-cum-challan — turnover + tax payment), GSTR-4 (annual return by 30th April)
- **GST reports**: CMP-08 quarterly data (total turnover, inward supplies under RCM, tax payable), GSTR-4 annual summary, HSN-wise summary
- Tax liability = **1% of total quarterly turnover** (calculated at quarter-end, not per transaction)

##### Scheme-Dependent Behavior Summary

| Feature                        | Regular GST                          | Composition Scheme                     |
| ------------------------------ | ------------------------------------ | -------------------------------------- |
| Invoice type                   | Tax Invoice                          | Bill of Supply                         |
| GST shown on invoice           | Yes (rate-wise breakup)              | No (mandatory declaration instead)     |
| Tax calculation                | Per-item at applicable rate          | 1% of total quarterly turnover         |
| Input Tax Credit               | Yes — full ITC ledger                | No — GST absorbed into purchase cost   |
| Inter-state sales              | Allowed                              | Blocked                                |
| E-commerce marketplace sales   | Allowed                              | Blocked                                |
| Purchase accounting            | GST separated (ITC claimable)        | GST absorbed into cost of goods        |
| Returns                        | GSTR-1, GSTR-3B, GSTR-9             | CMP-08 (quarterly), GSTR-4 (annual)   |
| Filing frequency               | Monthly/Quarterly + Annual           | Quarterly + Annual (5 total/year)      |
| HSN tracking                   | Required                             | Required (in GSTR-4)                   |
| B2B customer impact            | Buyer can claim ITC on your invoice  | Buyer cannot claim ITC                 |

##### Scheme Switching

- Tenant can switch from Composition → Regular (effective next FY, or immediately if turnover exceeds limit)
- System must support re-configuration without data loss
- Historical data retains the scheme that was active at the time of each transaction

#### FR-4.6.3: Expense Tracking

- Record non-inventory expenses: rent, electricity, salary, transport, packaging, repairs, miscellaneous
- Expense categories (configurable)
- Recurring expense support (e.g., monthly rent)
- Attach receipt images to expense entries

#### FR-4.6.4: Profit & Loss

- **Per-item profit**: selling price − average cost price − proportional discount
- **Overall P&L**: total revenue − COGS − expenses for any date range
- **Gross margin** by category, brand, product
- **Bargain impact report**: total additional discount given (money lost to bargaining) per period
- Dashboard with key metrics: today's sales, today's profit, outstanding receivables, outstanding payables

#### FR-4.6.5: Cash Flow

- Daily cash register (see FR-4.2.3)
- Cash-in-hand tracking across days
- Cash vs UPI vs Card collection breakdown
- Petty cash ledger

---

### 4.7 Reports & Analytics

| Report                            | Description                                              |
| --------------------------------- | -------------------------------------------------------- |
| **Daily Sales Summary**           | Total sales, returns, net sales, payment mode split      |
| **Sales by Category/Brand**       | Which categories and brands sell most                    |
| **Sales by Salesperson**          | Per-person sales performance                             |
| **Inventory Valuation**           | Total stock value at cost price                          |
| **Aging Inventory**               | Items in stock beyond threshold (90/180 days)            |
| **Low Stock Report**              | Items below minimum stock level                          |
| **Dead Stock Report**             | Items with zero sales in configurable period             |
| **Supplier Ledger**               | Per-supplier transaction history and balance             |
| **Customer Ledger (Khata)**       | Per-customer transaction history and balance             |
| **Outstanding Payables**          | Total owed to suppliers, with aging                      |
| **Outstanding Receivables**       | Total owed by customers, with aging                      |
| **Profit & Loss Statement**       | Revenue, COGS, gross profit, expenses, net profit        |
| **Bargain Discount Report**       | Additional discounts given, by period/salesperson        |
| **Cash Register Report**          | Daily cash reconciliation                                |
| **GST Summary**                   | Tax liability summary for filing                         |
| **Purchase Summary**              | Purchases by supplier, category, period                  |
| **Expense Report**                | Expenses by category and period                          |

All reports must support:
- Date range filtering
- Export to PDF and Excel
- Print-friendly layouts

---

### 4.8 Dashboard (Home Screen)

The dashboard is the first screen users see after login. Content varies by role.

#### Owner/Manager Dashboard

| Widget                        | Description                                               |
| ----------------------------- | --------------------------------------------------------- |
| **Today's Sales**             | Total revenue, number of bills, comparison with yesterday |
| **Today's Profit (est.)**     | Revenue − COGS for today                                  |
| **Cash-in-Hand**              | Current cash register balance                             |
| **Payment Mode Split**        | Today's collection: Cash vs UPI vs Card (pie chart)       |
| **Outstanding Receivables**   | Total khata balance owed by customers                     |
| **Outstanding Payables**      | Total owed to suppliers, with overdue highlighted         |
| **Low Stock Alerts**          | Count + quick list of items below minimum                 |
| **Aging Inventory**           | Count of items sitting beyond threshold                   |
| **Top Selling Items**         | Top 10 products by quantity/revenue (this week/month)     |
| **Recent Bills**              | Last 10 bills with quick-view                             |
| **Supplier Payments Due**     | Payments due in next 7 days                               |

#### Salesperson Dashboard

| Widget                        | Description                                               |
| ----------------------------- | --------------------------------------------------------- |
| **My Sales Today**            | Revenue and bill count for current salesperson             |
| **My Cash Register**          | Opening balance, current balance                          |
| **Quick Bill**                | One-tap entry to POS screen                               |
| **Recent My Bills**           | Last 10 bills created by this salesperson                 |

---

### 4.9 Audit Trail & Activity Log

- Log every create, update, and delete action across the system
- Each log entry records: action, entity type, entity ID, old value, new value, user, timestamp
- **Filterable by**: user, action type, entity type, date range
- Accessible to Owner only (Manager can view own actions)
- Key events to track:
  - Stock adjustments (with reason)
  - Price changes
  - Discount overrides at POS
  - Bill voids / cancellations
  - Cash register discrepancies
  - User login/logout
  - Credit given / payments received
- Retention: minimum 2 years
- Purpose: theft detection, dispute resolution, accountability

---

### 4.10 Notifications & Alerts

| Alert                          | Channel                    | Trigger                                     |
| ------------------------------ | -------------------------- | ------------------------------------------- |
| Low stock                      | In-app, Push notification  | Stock falls below configured minimum        |
| Supplier payment due           | In-app, Push notification  | Within 3 days of due date / overdue         |
| Customer credit reminder       | WhatsApp/SMS (manual send) | Owner/manager triggers from customer ledger |
| Daily sales summary            | In-app                     | End of business day                         |
| Cash register discrepancy      | In-app                     | Closing count doesn't match calculated      |
| Aging inventory                | In-app (weekly digest)     | Items exceed aging threshold                |

---

## 5. Non-Functional Requirements

### 5.1 Platform & UX

- **Mobile-first responsive web application** — must be fully usable on smartphones (360px+)
- Tablet and desktop layouts as progressive enhancements
- PWA (Progressive Web App) support for home-screen install
- **Offline / poor-connectivity support**: POS must remain functional during internet outages — queue bills locally and sync when connectivity resumes. Product catalog cached locally for barcode lookups. Offline mode must clearly indicate sync status
- **Offline conflict resolution**: when offline bills sync back to the server:
  - **POS wins**: the physical sale has already occurred, so the offline bill is always accepted and stock is decremented. If this results in negative stock (e.g., back-office adjusted stock to zero while POS sold the last item offline), the system records the negative quantity and flags a **stock discrepancy alert** for the owner/manager to investigate and reconcile
  - Offline bills are synced in chronological order (timestamp of creation)
  - During offline mode, the POS uses the locally cached stock count and does **not** block sales even if cached stock shows zero (the physical item may have been restocked without a sync)
  - On reconnect, a **sync summary** is shown: bills synced, any stock conflicts flagged
- Target: billing flow completable in under 60 seconds for a 5-item cart
- Support for **barcode scanner** hardware (USB/Bluetooth — keyboard-wedge mode)
- Support for **thermal receipt printers** (58mm/80mm) via browser print or direct ESC/POS
- Support for **label printers** (thermal label / A4 label sheets)
- **Mobile hardware strategy** (tiered approach):
  - **Tier 1 — Desktop/Laptop browser**: full support for USB barcode scanners (keyboard-wedge) and thermal printers (USB/network) via browser print dialog or Web USB API. This is the primary POS setup
  - **Tier 2 — Mobile browser (PWA)**: barcode scanning via device camera (built-in JS barcode reader as fallback), printing via network-enabled thermal printers (WiFi/LAN printers like Epson TM series), or print-to-PDF → share. Bluetooth scanner in keyboard-wedge mode works but the app must suppress on-screen keyboard on scanner-focused input fields (use `inputmode="none"` or readonly + JS listener)
  - **Tier 3 — Native Android wrapper (future)**: lightweight APK (e.g., via Capacitor/TWA) to handle Bluetooth barcode scanner pairing and direct ESC/POS printing to Bluetooth thermal printers, bypassing browser limitations. Planned for Phase 3+
  - The web app must detect the device context and adapt the UI accordingly (e.g., show camera-scan button on mobile, hide it on desktop)

### 5.2 Performance

- Page load: < 2 seconds on 4G connection
- POS barcode scan-to-item-added: < 500ms
- Search results: < 1 second
- Reports for up to 1 year of data: < 5 seconds
- Support 10,000+ SKUs per tenant without degradation

### 5.3 Security

- Authentication: email/phone + password, with OTP option
- Role-based access control (see Section 6)
- All data encrypted in transit (HTTPS) and at rest
- Tenant data isolation (see Section 7)
- Audit trail: log all create/update/delete actions with user and timestamp
- Session management with auto-logout on inactivity

### 5.4 Reliability & Data

- 99.5% uptime target
- Daily automated backups with 30-day retention
- Data export: tenant can export all their data at any time (CSV/Excel)

### 5.5 Localization

- Primary language: English
- Currency: INR (₹)
- Date format: DD-MM-YYYY
- Number format: Indian numbering system (12,34,567.00)
- Future: Hindi language support

---

## 6. User Roles & Permissions

### 6.1 Role Definitions

| Role          | Description                                               |
| ------------- | --------------------------------------------------------- |
| **Owner**     | Full access to everything. Manages store settings, users, and financials. |
| **Manager**   | Operational access. Can manage inventory, POS, purchases, and view reports. Limited financial settings. |
| **Salesperson** | POS billing, view-only inventory, customer creation. No access to cost prices, P&L, or settings. |

### 6.2 Permission Matrix

| Feature Area               | Owner | Manager | Salesperson |
| -------------------------- | ----- | ------- | ----------- |
| **POS — Create bills**     | Yes   | Yes     | Yes         |
| **POS — Process returns**  | Yes   | Yes     | No (needs approval) |
| **POS — Apply additional discount** | Yes | Yes | Up to configured limit |
| **POS — Cash register**    | Yes   | Yes     | Own register only |
| **Products — View**        | Yes   | Yes     | Yes (no cost price) |
| **Products — Create/Edit** | Yes   | Yes     | No          |
| **Products — Delete**      | Yes   | No      | No          |
| **Stock — Adjustments**    | Yes   | Yes     | No          |
| **Purchases — Create PO**  | Yes   | Yes     | No          |
| **Purchases — Record**     | Yes   | Yes     | No          |
| **Suppliers — View**       | Yes   | Yes     | No          |
| **Suppliers — Manage**     | Yes   | Yes     | No          |
| **Supplier payments**      | Yes   | Yes     | No          |
| **Customers — View**       | Yes   | Yes     | Own sales only |
| **Customers — Create**     | Yes   | Yes     | Yes         |
| **Customer credit**        | Yes   | Yes     | View only   |
| **Reports — Sales**        | Yes   | Yes     | Own sales only |
| **Reports — P&L / Finance**| Yes   | No      | No          |
| **Reports — GST**          | Yes   | Yes     | No          |
| **Expenses — Manage**      | Yes   | Yes     | No          |
| **Settings — Store**       | Yes   | No      | No          |
| **Settings — Users/Roles** | Yes   | No      | No          |
| **Barcode/Label printing** | Yes   | Yes     | Yes         |

---

## 7. Multi-Tenancy & SaaS Architecture

### 7.1 Tenant Model

- Each **store/business** is a tenant
- Tenant isolation at database level (schema-per-tenant or row-level with tenant_id)
- Tenant onboarding: self-service sign-up → store setup wizard
- Each tenant manages their own: products, categories, suppliers, customers, users, settings

### 7.2 Tenant-Configurable Settings

- Store name, address, logo, GSTIN
- **GST scheme**: Regular or Composition (drives invoice type, tax calculation, ITC, returns, and e-commerce eligibility)
- Invoice header/footer customization
- Product categories (can add custom categories beyond defaults)
- Size systems per category
- Tax rates per product
- Low stock thresholds
- Aging inventory thresholds
- Label template design
- Receipt template design
- Currency and locale (future)

### 7.3 SaaS Considerations

- **Subscription tiers** (future): Free/Basic/Pro based on SKU count, user count, features
- **Super admin panel**: manage tenants, view aggregate metrics, handle support
- **Tenant data export**: full data portability
- Rate limiting per tenant to prevent abuse
- Separate media/file storage per tenant (invoice images, product images)

---

## 8. Integrations

### 8.1 Current Scope (Phase 1)

| Integration              | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| Thermal receipt printer  | Print bills at POS counter                 |
| Thermal label printer    | Print barcode labels for products          |
| USB/Bluetooth barcode scanner | Scan items at POS and during stock operations |
| Browser Print API        | Fallback printing via system print dialog  |

### 8.2 Future Scope

| Integration              | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| Online storefront        | Sync inventory with own e-commerce site    |
| WhatsApp Business API    | Send bills, payment reminders to customers |
| SMS gateway              | OTP, payment reminders                     |
| Payment gateway          | Online payments for e-commerce             |
| Tally / accounting export| For CAs who use Tally for GST filing       |
| UPI deep-link            | Generate UPI payment links on invoices     |

---

## 9. Data Migration

### 9.1 Existing Data to Migrate

Since the store currently operates on paper notebooks, the following data needs to be entered during initial setup:

| Data                       | Source           | Migration Method                          |
| -------------------------- | ---------------- | ----------------------------------------- |
| Product catalog            | Mental / manual  | Manual entry + bulk CSV import tool       |
| Opening stock quantities   | Physical count   | Stock count entry screen during setup     |
| Supplier directory         | Notebook / phone | Manual entry                              |
| Customer directory         | Notebook         | Manual entry or bulk import               |
| **Customer credit balances** | Notebook       | Opening balance entry per customer        |
| **Supplier credit balances** | Notebook       | Opening balance entry per supplier        |

### 9.2 Migration Features

- **Setup wizard**: guided flow for first-time store setup (store details → **GST scheme selection (Regular / Composition)** → categories → products → opening stock → opening balances)
- **Opening balance entries**: allow entering existing credit balances for customers and suppliers as of a cut-off date, without requiring historical transaction history
- **Bulk import**: CSV/Excel templates provided for products, customers, suppliers
- **Validation**: duplicate detection (by phone number for customers, by GSTIN/name for suppliers)
- **No historical transaction import required** — the system starts fresh from the go-live date; only opening balances carry forward

---

## 10. Phased Delivery Plan

### Phase 1 — Foundation (MVP)
> Goal: Replace notebooks and enable digital billing

- Tenant setup, user management, roles (Owner, Manager, Salesperson)
- Product catalog with categories, brands, sizes, SKU generation
- Barcode generation and label printing
- POS billing screen with barcode scanner support
- Discount handling (catalog + additional/bargain)
- Mixed payment modes (Cash, UPI, Card)
- Bill printing (thermal receipt)
- Basic inventory tracking (stock-in from purchase, stock-out from sale)
- Direct purchase recording (without PO)
- Customer directory + credit (khata) tracking
- Supplier directory + credit (payables) tracking
- Daily cash register
- Data migration: setup wizard, opening balances, bulk import
- Dashboard (home screen)

### Phase 2 — Accounting & Intelligence
> Goal: Full financial visibility and smarter inventory

- Purchase Orders (create, send, track, partial receipt)
- Purchase returns and supplier returns
- GST management (ITC tracking, GSTR-1, GSTR-3B reports)
- Profit & Loss reports
- Expense tracking (with categories, recurring expenses)
- Sales reports (by category, brand, salesperson, period)
- Inventory reports (valuation, low stock, aging, dead stock)
- Supplier & customer ledger reports
- Bargain impact report
- Stock adjustments with reason codes
- Physical stock audit / count feature
- Audit trail & activity log
- Export to PDF / Excel

### Phase 3 — Alerts, Notifications & Refinement
> Goal: Proactive operations management

- Low stock alerts (configurable per SKU)
- Supplier payment due date alerts
- Aging inventory alerts (weekly digest)
- Cash register discrepancy alerts
- Returns & exchanges workflow (linked to original bill)
- Credit note / store credit management
- Hold & recall bills at POS
- Salesperson performance reports
- Offline POS support (local queue + sync)
- PWA enhancements (home screen install, push notifications)

### Phase 4 — SaaS & Scale
> Goal: Productize for other retailers

- Multi-tenant onboarding (self-service sign-up, store setup wizard)
- Super admin panel (tenant management, metrics, support)
- Subscription/billing system (Free/Basic/Pro tiers)
- Tenant-configurable settings (label templates, receipt templates, categories)
- Rate limiting, tenant isolation hardening
- Multi-location support per tenant
- Tally / accounting export
- WhatsApp Business API integration (bills, reminders)
- SMS gateway (OTP, reminders)

### Phase 5 — E-Commerce (Future)
> Goal: Online sales channel

- Online storefront integration (inventory sync)
- Payment gateway integration
- UPI deep-link on invoices
- Order management for online orders
- Shipping / delivery tracking

---

## 11. Glossary

| Term                  | Definition                                                   |
| --------------------- | ------------------------------------------------------------ |
| **SKU**               | Stock Keeping Unit — a unique identifier for each product variant (brand + type + size + color) |
| **POS**               | Point of Sale — the billing counter interface                |
| **Khata**             | Informal credit ledger system common in Indian retail        |
| **HSN Code**          | Harmonized System of Nomenclature — product classification code used for GST |
| **GSTIN**             | GST Identification Number — unique ID for GST-registered businesses |
| **Tenant**            | A single store/business instance in the multi-tenant system  |
| **Catalog Discount**  | The standard discount percentage set on a product (e.g., 15% off) |
| **Additional Discount** | Extra discount given due to customer bargaining, tracked separately |
| **Aging Inventory**   | Stock that has been sitting unsold beyond a defined threshold |
| **PO**                | Purchase Order — a formal order sent to a supplier           |
| **COGS**              | Cost of Goods Sold — total cost of items sold in a period    |
| **Composition Scheme** | Simplified GST scheme (Section 10, CGST Act) — flat 1% tax on turnover, no ITC, no GST on invoices, no inter-state sales |
| **Bill of Supply**    | Invoice issued by composition dealers or for exempt supplies — no GST breakup shown |
| **Tax Invoice**       | Invoice issued by regular GST dealers — includes full GST breakup (CGST/SGST/IGST) |
| **ITC**               | Input Tax Credit — GST paid on purchases that can be offset against output tax (regular scheme only) |
| **RCM**               | Reverse Charge Mechanism — buyer pays GST instead of seller, for specified goods/services |
| **CMP-08**            | Quarterly statement-cum-challan filed by composition dealers for tax payment |
| **GSTR-4**            | Annual return filed by composition dealers                    |

---

*End of Document*

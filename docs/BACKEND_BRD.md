# Backend BRD — InvenTrack

| Field            | Detail                                      |
| ---------------- | ------------------------------------------- |
| **Document Version** | 1.0                                     |
| **Date**         | 2026-03-30                                  |
| **Parent BRDs**  | BRD.md v1.0, FRONTEND_BRD.md v1.0          |
| **Status**       | Draft                                       |

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Multi-Tenancy Strategy](#2-multi-tenancy-strategy)
3. [Authentication & Authorization](#3-authentication--authorization)
4. [Data Models](#4-data-models)
5. [API Specification](#5-api-specification)
6. [Business Logic Rules](#6-business-logic-rules)
7. [Offline Sync Protocol](#7-offline-sync-protocol)
8. [Background Jobs & Scheduled Tasks](#8-background-jobs--scheduled-tasks)
9. [File Storage](#9-file-storage)
10. [Barcode & Label Generation](#10-barcode--label-generation)
11. [GST Calculation Engine](#11-gst-calculation-engine)
12. [Bill Number Generation](#12-bill-number-generation)
13. [Report Queries](#13-report-queries)
14. [Notification System](#14-notification-system)
15. [Audit Logging](#15-audit-logging)
16. [Caching Strategy](#16-caching-strategy)
17. [Error Handling](#17-error-handling)
18. [Rate Limiting](#18-rate-limiting)
19. [Backup & Data Export](#19-backup--data-export)
20. [Phase Alignment](#20-phase-alignment)

---

## 1. Architecture Overview

### 1.1 API Style

- **RESTful JSON API** over HTTPS
- All endpoints prefixed with `/api/v1/`
- Standard HTTP methods: GET (read), POST (create), PUT (full update), PATCH (partial update), DELETE (soft delete)
- Pagination: cursor-based for lists (`?cursor=xxx&limit=20`). Offset-based as fallback for reports (`?page=1&per_page=50`)
- Sorting: `?sort=created_at&order=desc`
- Filtering: query parameters per field (e.g., `?category_id=5&status=low_stock`)
- All responses follow a consistent envelope:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "cursor": "xxx", "has_more": true },
  "error": null
}
```

Error responses:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Product MVT-RPA-RN-L-001 has only 2 units in stock",
    "details": { "product_id": "...", "available": 2, "requested": 5 }
  }
}
```

### 1.2 High-Level Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Frontend    │────▶│  API Server  │────▶│  Database    │
│  (PWA/Web)   │     │  (REST API)  │     │  (PostgreSQL)│
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────┴───────┐
                    │  Background  │──▶ File Storage (S3/Minio)
                    │  Job Worker  │──▶ Email/SMS service
                    └──────────────┘
```

- **API Server**: stateless, horizontally scalable. Handles all HTTP requests
- **Database**: PostgreSQL (primary). Single database, row-level tenant isolation
- **Background Worker**: processes async jobs — report generation, PDF export, notifications, recurring expenses, image processing
- **File Storage**: S3-compatible object storage (AWS S3 or self-hosted MinIO) for product images, invoice uploads, exports, label PDFs
- **Cache**: Redis — sessions, frequently queried data (dashboard stats, product lookups for POS)
- **Search**: PostgreSQL full-text search initially. Elasticsearch/Meilisearch can be added later if needed for product search at scale

---

## 2. Multi-Tenancy Strategy

### 2.1 Isolation Model: Row-Level with `tenant_id`

Every tenant-scoped table includes a `tenant_id` column. All queries are automatically scoped by tenant.

**Why row-level over schema-per-tenant:**
- Simpler migrations (one schema to update)
- Simpler connection pooling (one database, one pool)
- Works well up to thousands of tenants
- Easier to query aggregate metrics for super admin

**Trade-off:** Data isolation relies on application-level enforcement. Every query must be tenant-scoped.

### 2.2 Tenant Scoping Enforcement

- **Middleware**: every authenticated request extracts `tenant_id` from the JWT token and injects it into the request context
- **ORM/Query layer**: a base query scope automatically applies `WHERE tenant_id = ?` to all tenant-scoped models. No raw queries without tenant filtering
- **API routes**: no tenant ID in the URL. Tenant is always derived from the authenticated user's token
- **Super Admin routes** (`/api/v1/admin/*`): exempt from tenant scoping, use explicit tenant_id parameters

### 2.3 Tenant Lifecycle

| Event                 | Backend Action                                                |
| --------------------- | ------------------------------------------------------------- |
| Sign-up               | Create `tenant` record + owner `user` record. Seed default categories, size systems, settings |
| Setup wizard complete  | Update `tenant.setup_complete = true`                        |
| Active usage          | All data writes include `tenant_id`                          |
| Data export           | Background job generates CSV/Excel per entity for the tenant |
| Suspension (SaaS)     | Set `tenant.status = suspended`. Middleware rejects all non-read requests. Reads still allowed for data export |
| Deletion              | Soft-delete `tenant`. Hard-delete data after retention period |

---

## 3. Authentication & Authorization

### 3.1 Authentication

| Method              | Details                                                    | Phase |
| ------------------- | ---------------------------------------------------------- | ----- |
| Email/Phone + Password | Primary login. Passwords hashed with bcrypt (cost 12+) | 1     |
| JWT Access Token    | Short-lived (15 min). Contains: user_id, tenant_id, role. Sent as `Authorization: Bearer <token>` | 1 |
| Refresh Token       | Long-lived (7 days). Stored in HTTP-only cookie. Used to rotate access tokens | 1 |
| Forgot Password     | Generate time-limited reset token (1 hour). Send via email/SMS | 1 |
| OTP Login           | Optional. 6-digit OTP sent via SMS. Valid for 5 minutes   | 3     |

**JWT Payload:**
```json
{
  "sub": "user_uuid",
  "tid": "tenant_uuid",
  "role": "owner",
  "iat": 1711756800,
  "exp": 1711757700
}
```

### 3.2 Authorization (RBAC)

Roles are fixed in Phase 1 (Owner, Manager, Salesperson). Custom roles are a future extension.

**Enforcement:**
- Middleware checks role from JWT against required role(s) per endpoint
- Field-level filtering: `cost_price` stripped from product responses when `role = salesperson`
- Conditional logic: salesperson can only view own bills, own cash register, own customers (those they created or sold to)

**Permission checks that require business logic (not just role-checking):**
- Salesperson discount limit: compare `additional_discount` against `tenant.settings.max_salesperson_discount`. If exceeded, reject unless an approval token from a manager/owner is provided
- Return processing: salesperson cannot initiate — requires manager/owner session or an approval flow
- Stock adjustments: require manager/owner role
- Settings changes: owner only

### 3.3 Session Management

- Access token rotation on every refresh
- Sessions invalidated on password change
- Auto-logout: frontend handles via token expiry. No server-side session tracking in Phase 1
- Multiple device login allowed (multiple refresh tokens per user)

---

## 4. Data Models

All models include: `id` (UUID), `tenant_id` (UUID, FK), `created_at`, `updated_at`. Tenant-scoped unless noted.

### 4.1 Core Entities

#### Tenant (not tenant-scoped)

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| name                 | VARCHAR(255)  | Store/business name                        |
| address              | TEXT          |                                            |
| phone                | VARCHAR(15)   |                                            |
| email                | VARCHAR(255)  |                                            |
| logo_url             | VARCHAR(500)  | S3 path                                    |
| gstin                | VARCHAR(15)   | 15-char GSTIN. Nullable for unregistered   |
| gst_scheme           | ENUM          | `regular`, `composition`                   |
| financial_year_start | SMALLINT      | Month (1-12). Default 4 (April)            |
| invoice_prefix       | VARCHAR(10)   | e.g., `KVB`                                |
| settings             | JSONB         | Flexible settings (thresholds, limits, templates) |
| setup_complete       | BOOLEAN       | Default false                              |
| status               | ENUM          | `active`, `suspended`, `deleted`           |
| plan                 | ENUM          | `free`, `basic`, `pro` (Phase 4)           |
| created_at           | TIMESTAMP     |                                            |
| updated_at           | TIMESTAMP     |                                            |

**`settings` JSONB structure:**
```json
{
  "low_stock_default_threshold": 10,
  "aging_threshold_days": 90,
  "return_window_days": 15,
  "max_salesperson_discount_amount": 500,
  "max_salesperson_discount_percent": 10,
  "receipt_footer_text": "Thank you for shopping!",
  "receipt_header_text": "",
  "label_template_id": "default"
}
```

#### User

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| name                 | VARCHAR(255)  |                                            |
| phone                | VARCHAR(15)   | Unique within tenant                       |
| email                | VARCHAR(255)  | Nullable                                   |
| password_hash        | VARCHAR(255)  | bcrypt                                     |
| role                 | ENUM          | `owner`, `manager`, `salesperson`          |
| is_active            | BOOLEAN       | Soft-disable without deletion              |
| last_login_at        | TIMESTAMP     |                                            |

### 4.2 Product & Inventory

#### Category

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| name                 | VARCHAR(255)  | e.g., "Men's Vests"                        |
| code                 | VARCHAR(10)   | e.g., "MVT". Used in SKU generation        |
| sort_order           | SMALLINT      |                                            |
| is_active            | BOOLEAN       |                                            |

#### SubType

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| category_id          | UUID (FK)     |                                            |
| name                 | VARCHAR(255)  | e.g., "RN", "Boxer"                        |
| code                 | VARCHAR(10)   |                                            |

#### SizeSystem

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| name                 | VARCHAR(100)  | e.g., "Letter (S-XXL)", "Jeans (28-38)"   |
| values               | JSONB         | Ordered array: `["S","M","L","XL","XXL"]`  |

#### CategorySizeSystem (join)

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| category_id          | UUID (FK)     |                                            |
| size_system_id       | UUID (FK)     |                                            |

#### Brand

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| name                 | VARCHAR(255)  | e.g., "Rupa"                               |
| code                 | VARCHAR(10)   | e.g., "RPA". Used in SKU generation        |

#### Product

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| name                 | VARCHAR(255)  |                                            |
| sku                  | VARCHAR(50)   | Unique within tenant                       |
| barcode              | VARCHAR(50)   | Generated or manual. Unique within tenant  |
| category_id          | UUID (FK)     |                                            |
| sub_type_id          | UUID (FK)     | Nullable                                   |
| brand_id             | UUID (FK)     | Nullable                                   |
| size                 | VARCHAR(20)   | Nullable (free-size products)              |
| color                | VARCHAR(50)   | Nullable                                   |
| hsn_code             | VARCHAR(8)    |                                            |
| gst_rate             | DECIMAL(5,2)  | e.g., 5.00, 12.00                          |
| selling_price        | DECIMAL(10,2) | Current selling price (inclusive of GST)    |
| cost_price           | DECIMAL(10,2) | Average cost price (recalculated on purchase) |
| mrp                  | DECIMAL(10,2) | Nullable                                   |
| catalog_discount_pct | DECIMAL(5,2)  | Default discount %. e.g., 15.00            |
| min_stock_level      | INTEGER       | Low stock threshold. Default from tenant settings |
| reorder_point        | INTEGER       | Nullable                                   |
| description          | TEXT          | Nullable                                   |
| image_urls           | JSONB         | Array of S3 paths                          |
| is_active            | BOOLEAN       | Archived = false                           |

**Indexes:** `(tenant_id, sku)` unique, `(tenant_id, barcode)` unique, `(tenant_id, category_id)`, `(tenant_id, brand_id)`, `(tenant_id, name)` GIN trigram for search.

#### StockEntry

Tracks every stock movement. Source of truth for current quantity (computed via SUM).

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| product_id           | UUID (FK)     |                                            |
| quantity             | INTEGER       | Positive = stock in, Negative = stock out  |
| type                 | ENUM          | `purchase`, `sale`, `return_customer`, `return_supplier`, `adjustment`, `opening` |
| reference_type       | VARCHAR(50)   | `bill`, `purchase`, `adjustment`, etc.     |
| reference_id         | UUID          | FK to the source record                    |
| cost_price_at_entry  | DECIMAL(10,2) | Cost per unit at time of this movement     |
| reason               | VARCHAR(255)  | For adjustments: damage, theft, count correction |
| created_by           | UUID (FK)     | User who made the entry                    |
| created_at           | TIMESTAMP     | Also serves as the "date entered inventory" for aging |

**Current stock = `SELECT SUM(quantity) FROM stock_entries WHERE product_id = ? AND tenant_id = ?`**

A materialized view or cache column (`product.current_stock`) can be maintained for fast reads.

### 4.3 Sales & POS

#### Bill

| Column                    | Type          | Notes                                      |
| ------------------------- | ------------- | ------------------------------------------ |
| id                        | UUID (PK)     |                                            |
| tenant_id                 | UUID (FK)     |                                            |
| bill_number               | VARCHAR(30)   | Auto-generated. Unique within tenant       |
| customer_id               | UUID (FK)     | Nullable (walk-in)                         |
| salesperson_id            | UUID (FK)     | User who created the bill                  |
| subtotal                  | DECIMAL(12,2) | Before discounts                           |
| catalog_discount_total    | DECIMAL(12,2) | Sum of per-item catalog discounts          |
| additional_discount_amount| DECIMAL(12,2) | Bargain/negotiated discount on whole bill  |
| additional_discount_pct   | DECIMAL(5,2)  | If applied as percentage                   |
| tax_amount                | DECIMAL(12,2) | Back-calculated GST (Regular scheme only)  |
| net_amount                | DECIMAL(12,2) | Final payable                              |
| gst_scheme_at_sale        | ENUM          | `regular`, `composition` — snapshot        |
| status                    | ENUM          | `completed`, `returned`, `partially_returned`, `voided`, `held` |
| is_offline                | BOOLEAN       | Was this bill created offline?             |
| offline_created_at        | TIMESTAMP     | Original creation time from the device     |
| notes                     | TEXT          | Nullable                                   |
| created_at                | TIMESTAMP     |                                            |

#### BillItem

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| bill_id              | UUID (FK)     |                                            |
| product_id           | UUID (FK)     |                                            |
| product_name         | VARCHAR(255)  | Snapshot at time of sale                   |
| sku                  | VARCHAR(50)   | Snapshot                                   |
| hsn_code             | VARCHAR(8)    | Snapshot                                   |
| size                 | VARCHAR(20)   | Snapshot                                   |
| quantity             | INTEGER       |                                            |
| unit_price           | DECIMAL(10,2) | Selling price at time of sale              |
| catalog_discount_pct | DECIMAL(5,2)  | Snapshot                                   |
| catalog_discount_amt | DECIMAL(10,2) | Calculated                                 |
| gst_rate             | DECIMAL(5,2)  | Snapshot                                   |
| cgst_amount          | DECIMAL(10,2) | Back-calculated (Regular only, else 0)     |
| sgst_amount          | DECIMAL(10,2) | Back-calculated (Regular only, else 0)     |
| cost_price           | DECIMAL(10,2) | Snapshot for profit calculation             |
| line_total           | DECIMAL(10,2) | After catalog discount                     |
| returned_qty         | INTEGER       | Default 0. Tracks partial returns          |

**Key design:** BillItems snapshot all prices, discounts, and tax rates at time of sale. This ensures returns always use original values and historical reports remain accurate even if product data changes.

#### BillPayment

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| bill_id              | UUID (FK)     |                                            |
| mode                 | ENUM          | `cash`, `upi`, `card`, `credit`            |
| amount               | DECIMAL(10,2) |                                            |
| reference            | VARCHAR(100)  | UPI ref, card approval code, etc.          |

Multiple rows per bill for split payments. `credit` mode creates a corresponding `LedgerEntry` in customer khata.

#### Return

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| original_bill_id     | UUID (FK)     |                                            |
| return_number        | VARCHAR(30)   | Auto-generated                             |
| refund_mode          | ENUM          | `cash`, `credit_note`, `exchange`          |
| refund_amount        | DECIMAL(10,2) | Based on original bill values              |
| reason               | VARCHAR(255)  |                                            |
| processed_by         | UUID (FK)     |                                            |
| exchange_bill_id     | UUID (FK)     | If exchange, links to the new bill         |
| created_at           | TIMESTAMP     |                                            |

#### ReturnItem

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| return_id            | UUID (FK)     |                                            |
| bill_item_id         | UUID (FK)     | Links to original BillItem                 |
| quantity             | INTEGER       | How many of this item returned             |
| refund_amount        | DECIMAL(10,2) | Calculated from original bill_item values  |

### 4.4 Purchases

#### PurchaseOrder

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| po_number            | VARCHAR(30)   | Auto-generated                             |
| supplier_id          | UUID (FK)     |                                            |
| status               | ENUM          | `draft`, `sent`, `partially_received`, `received`, `cancelled` |
| expected_total       | DECIMAL(12,2) |                                            |
| notes                | TEXT          |                                            |
| created_by           | UUID (FK)     |                                            |
| created_at           | TIMESTAMP     |                                            |

#### PurchaseOrderItem

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| po_id                | UUID (FK)     |                                            |
| product_id           | UUID (FK)     |                                            |
| ordered_qty          | INTEGER       |                                            |
| received_qty         | INTEGER       | Updated as goods are received              |
| expected_cost        | DECIMAL(10,2) | Per unit                                   |

#### Purchase (Goods Receipt)

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| po_id                | UUID (FK)     | Nullable (direct purchase)                 |
| supplier_id          | UUID (FK)     |                                            |
| invoice_number       | VARCHAR(50)   | Supplier's invoice number                  |
| invoice_date         | DATE          |                                            |
| invoice_image_url    | VARCHAR(500)  | S3 path                                    |
| total_amount         | DECIMAL(12,2) | Including GST                              |
| cgst_amount          | DECIMAL(10,2) | Regular scheme: tracked for ITC            |
| sgst_amount          | DECIMAL(10,2) |                                            |
| igst_amount          | DECIMAL(10,2) | Inter-state purchases                      |
| is_rcm               | BOOLEAN       | Reverse charge applicable?                 |
| created_by           | UUID (FK)     |                                            |
| created_at           | TIMESTAMP     |                                            |

#### PurchaseItem

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| purchase_id          | UUID (FK)     |                                            |
| product_id           | UUID (FK)     |                                            |
| quantity             | INTEGER       |                                            |
| cost_price           | DECIMAL(10,2) | Per unit (excluding or including GST based on scheme) |
| gst_rate             | DECIMAL(5,2)  |                                            |
| gst_amount           | DECIMAL(10,2) |                                            |

### 4.5 Supplier & Customer

#### Supplier

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| name                 | VARCHAR(255)  |                                            |
| contact_person       | VARCHAR(255)  |                                            |
| phone                | VARCHAR(15)   |                                            |
| email                | VARCHAR(255)  |                                            |
| address              | TEXT          |                                            |
| gstin                | VARCHAR(15)   |                                            |
| payment_terms        | VARCHAR(100)  | e.g., "Net 30"                             |
| notes                | TEXT          |                                            |
| outstanding_balance  | DECIMAL(12,2) | Denormalized. Updated on purchase/payment  |
| is_active            | BOOLEAN       |                                            |

#### Customer

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| name                 | VARCHAR(255)  |                                            |
| phone                | VARCHAR(15)   | Unique within tenant. Primary identifier   |
| email                | VARCHAR(255)  | Nullable                                   |
| address              | TEXT          | Nullable                                   |
| outstanding_balance  | DECIMAL(12,2) | Denormalized. Updated on credit sale/payment |
| created_by           | UUID (FK)     | Which user created this customer           |
| is_active            | BOOLEAN       |                                            |

#### LedgerEntry (Shared for Supplier + Customer)

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| party_type           | ENUM          | `customer`, `supplier`                     |
| party_id             | UUID          | FK to customer or supplier                 |
| entry_type           | ENUM          | `sale`, `purchase`, `payment`, `return`, `adjustment`, `opening_balance` |
| debit                | DECIMAL(12,2) |                                            |
| credit               | DECIMAL(12,2) |                                            |
| reference_type       | VARCHAR(50)   | `bill`, `purchase`, `payment`, `return`    |
| reference_id         | UUID          |                                            |
| payment_mode         | ENUM          | Nullable. `cash`, `upi`, `bank_transfer`, `cheque`, `card` |
| payment_reference    | VARCHAR(100)  | Cheque no, UPI ref, etc.                   |
| due_date             | DATE          | For supplier payables                      |
| description          | VARCHAR(255)  |                                            |
| created_by           | UUID (FK)     |                                            |
| created_at           | TIMESTAMP     |                                            |

**Running balance is NOT stored in this table.** It is computed dynamically when querying the ledger using SQL window functions:
```sql
SELECT *, SUM(debit - credit) OVER (ORDER BY created_at) AS running_balance
FROM ledger_entries
WHERE tenant_id = ? AND party_type = ? AND party_id = ?
ORDER BY created_at;
```
This avoids concurrency issues where two simultaneous payments for the same party could read stale balances and write conflicting values. The denormalized `outstanding_balance` on `Customer` / `Supplier` tables is updated atomically:
```sql
UPDATE customers SET outstanding_balance = outstanding_balance - ? WHERE id = ? AND tenant_id = ?;
```
This atomic update is safe under concurrency (row-level lock on the customer/supplier row).

### 4.6 Accounting

#### Expense

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| category             | VARCHAR(100)  | Configurable per tenant                    |
| amount               | DECIMAL(10,2) |                                            |
| description          | VARCHAR(255)  |                                            |
| expense_date         | DATE          |                                            |
| is_recurring         | BOOLEAN       |                                            |
| recurrence_interval  | VARCHAR(20)   | `monthly`, `quarterly`, `yearly`           |
| receipt_image_url    | VARCHAR(500)  |                                            |
| created_by           | UUID (FK)     |                                            |
| created_at           | TIMESTAMP     |                                            |

#### CashRegister

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| user_id              | UUID (FK)     | Salesperson/manager                        |
| register_date        | DATE          |                                            |
| opening_balance      | DECIMAL(10,2) |                                            |
| calculated_closing   | DECIMAL(10,2) | System-calculated from transactions        |
| actual_closing       | DECIMAL(10,2) | User-entered counted cash. Nullable until closed |
| discrepancy          | DECIMAL(10,2) | actual - calculated                        |
| status               | ENUM          | `open`, `closed`                           |

#### CashRegisterEntry

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| register_id          | UUID (FK)     |                                            |
| type                 | ENUM          | `cash_sale`, `credit_collection`, `petty_expense`, `supplier_payment` |
| amount               | DECIMAL(10,2) | Positive = inflow, Negative = outflow      |
| reference_type       | VARCHAR(50)   |                                            |
| reference_id         | UUID          |                                            |
| description          | VARCHAR(255)  |                                            |
| created_at           | TIMESTAMP     |                                            |

### 4.7 Notifications & Audit

#### Notification

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| user_id              | UUID (FK)     | Nullable (tenant-wide notifications)       |
| type                 | VARCHAR(50)   | `low_stock`, `payment_due`, `discrepancy`, `daily_summary`, `sync_conflict`, `aging` |
| title                | VARCHAR(255)  |                                            |
| body                 | TEXT          |                                            |
| data                 | JSONB         | Payload for navigation (entity type, ID)   |
| is_read              | BOOLEAN       | Default false                              |
| created_at           | TIMESTAMP     |                                            |

#### AuditLog

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| user_id              | UUID (FK)     |                                            |
| action               | ENUM          | `create`, `update`, `delete`, `login`, `logout`, `void` |
| entity_type          | VARCHAR(50)   | `product`, `bill`, `stock_entry`, etc.     |
| entity_id            | UUID          |                                            |
| old_value            | JSONB         | Nullable                                   |
| new_value            | JSONB         | Nullable                                   |
| ip_address           | INET          |                                            |
| created_at           | TIMESTAMP     |                                            |

**Index:** `(tenant_id, created_at DESC)`, `(tenant_id, entity_type, entity_id)`. Partitioned by month for large tenants.

### 4.8 Sync Conflicts (Offline POS)

#### SyncConflict

| Column               | Type          | Notes                                      |
| -------------------- | ------------- | ------------------------------------------ |
| id                   | UUID (PK)     |                                            |
| tenant_id            | UUID (FK)     |                                            |
| submitted_by         | UUID (FK)     | Salesperson who was offline                |
| offline_bill_data    | JSONB         | Full bill payload as submitted from device |
| conflict_reason      | VARCHAR(255)  | e.g., "Product deleted", "Negative stock"  |
| status               | ENUM          | `pending`, `force_accepted`, `edited`, `voided` |
| resolved_by          | UUID (FK)     | Nullable until resolved                    |
| resolved_at          | TIMESTAMP     |                                            |
| resolution_notes     | TEXT          |                                            |
| created_at           | TIMESTAMP     |                                            |

---

## 5. API Specification

Endpoints grouped by module. Phase column aligns with Frontend BRD phasing.

### 5.1 Authentication

| Method | Endpoint                    | Phase | Description                          |
| ------ | --------------------------- | ----- | ------------------------------------ |
| POST   | `/auth/login`               | 1     | Email/phone + password → tokens      |
| POST   | `/auth/refresh`             | 1     | Refresh token → new access token     |
| POST   | `/auth/logout`              | 1     | Invalidate refresh token             |
| POST   | `/auth/forgot-password`     | 1     | Send reset link/OTP                  |
| POST   | `/auth/reset-password`      | 1     | Validate token + set new password    |
| POST   | `/auth/verify-otp`          | 3     | Verify 6-digit OTP                   |
| GET    | `/auth/me`                  | 1     | Current user profile + tenant info   |

### 5.2 Setup & Settings

| Method | Endpoint                        | Phase | Description                          |
| ------ | ------------------------------- | ----- | ------------------------------------ |
| POST   | `/setup/tenant`                 | 1     | Create tenant + owner (sign-up)      |
| PUT    | `/setup/wizard`                 | 1     | Complete setup wizard steps          |
| GET    | `/settings`                     | 1     | Get all tenant settings              |
| PATCH  | `/settings`                     | 1     | Update tenant settings               |
| GET    | `/settings/store`               | 1     | Store profile details                |
| PATCH  | `/settings/store`               | 1     | Update store profile                 |

### 5.3 Users

| Method | Endpoint                    | Phase | Description                          |
| ------ | --------------------------- | ----- | ------------------------------------ |
| GET    | `/users`                    | 1     | List all users in tenant             |
| POST   | `/users`                    | 1     | Create/invite user                   |
| GET    | `/users/:id`                | 1     | Get user details                     |
| PATCH  | `/users/:id`                | 1     | Update user (role, name, active)     |
| POST   | `/users/:id/reset-password` | 1     | Owner resets a user's password       |

### 5.4 Categories, SubTypes, Sizes, Brands

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| GET    | `/categories`                    | 1     | List categories                      |
| POST   | `/categories`                    | 1     | Create category                      |
| PATCH  | `/categories/:id`                | 1     | Update category                      |
| DELETE | `/categories/:id`                | 1     | Deactivate category                  |
| GET    | `/categories/:id/sub-types`      | 1     | List sub-types for a category        |
| POST   | `/sub-types`                     | 1     | Create sub-type                      |
| PATCH  | `/sub-types/:id`                 | 1     | Update sub-type                      |
| GET    | `/size-systems`                  | 1     | List size systems                    |
| POST   | `/size-systems`                  | 1     | Create size system                   |
| PATCH  | `/size-systems/:id`              | 1     | Update size system                   |
| GET    | `/brands`                        | 1     | List brands                          |
| POST   | `/brands`                        | 1     | Create brand                         |
| PATCH  | `/brands/:id`                    | 1     | Update brand                         |

### 5.5 Products

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| GET    | `/products`                      | 1     | List products (paginated, filterable, searchable) |
| GET    | `/products/:id`                  | 1     | Product detail                       |
| POST   | `/products`                      | 1     | Create product                       |
| PUT    | `/products/:id`                  | 1     | Update product                       |
| DELETE | `/products/:id`                  | 1     | Archive product (soft delete — sets `is_active = false`). **Product data is never hard-deleted.** See Section 6.6 |
| GET    | `/products/search`               | 1     | Fast search for POS (by barcode, SKU, or name). Optimized for < 500ms |
| POST   | `/products/import`               | 1     | Bulk CSV/Excel import. Returns job ID for async processing |
| GET    | `/products/import/:jobId/status` | 1     | Check import job status              |
| POST   | `/products/:id/barcode`          | 1     | Generate barcode for product         |

### 5.6 Stock

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| GET    | `/stock`                         | 1     | Stock overview (all products with qty, status) |
| GET    | `/stock/:productId`              | 1     | Stock detail for one product         |
| GET    | `/stock/:productId/history`      | 1     | Stock movement history               |
| POST   | `/stock/adjust`                  | 2     | Stock adjustment (with reason)       |
| POST   | `/stock/audit`                   | 2     | Submit physical count → get variance report |
| POST   | `/stock/audit/approve`           | 2     | Approve adjustments from audit       |

### 5.7 POS / Bills

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| POST   | `/bills`                         | 1     | Create new bill (complete sale). Atomically: create bill + bill_items + payments + stock entries + ledger entries + cash register entries |
| GET    | `/bills`                         | 1     | List bills (paginated, filterable)   |
| GET    | `/bills/:id`                     | 1     | Bill detail with items and payments  |
| GET    | `/bills/:id/print`               | 1     | Get print-ready bill data (Tax Invoice or Bill of Supply based on scheme) |
| POST   | `/bills/:id/void`                | 2     | Void a bill (reverses stock, ledger) |
| POST   | `/bills/hold`                    | 3     | Hold current cart (store as draft)   |
| GET    | `/bills/held`                    | 3     | List held bills                      |
| POST   | `/bills/held/:id/resume`         | 3     | Resume a held bill                   |
| DELETE | `/bills/held/:id`                | 3     | Discard a held bill                  |
| POST   | `/bills/sync`                    | 3     | Sync offline bills (batch). See Section 7 |

### 5.8 Returns

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| POST   | `/returns`                       | 3     | Process return against a bill        |
| GET    | `/returns`                       | 3     | List returns                         |
| GET    | `/returns/:id`                   | 3     | Return detail                        |

### 5.9 Purchases

| Method | Endpoint                             | Phase | Description                          |
| ------ | ------------------------------------ | ----- | ------------------------------------ |
| GET    | `/purchase-orders`                   | 2     | List POs                             |
| POST   | `/purchase-orders`                   | 2     | Create PO                            |
| GET    | `/purchase-orders/:id`               | 2     | PO detail                            |
| PATCH  | `/purchase-orders/:id`               | 2     | Update PO (edit, change status)      |
| GET    | `/purchase-orders/:id/pdf`           | 2     | Generate PO as PDF                   |
| POST   | `/purchases`                         | 1     | Record goods receipt (direct or against PO). Atomically: create purchase + items + stock entries + update avg cost + ledger entry + ITC entry |
| GET    | `/purchases`                         | 1     | List purchases                       |
| GET    | `/purchases/:id`                     | 1     | Purchase detail                      |
| POST   | `/purchase-returns`                  | 2     | Record purchase return               |

### 5.10 Suppliers

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| GET    | `/suppliers`                     | 1     | List suppliers                       |
| POST   | `/suppliers`                     | 1     | Create supplier                      |
| GET    | `/suppliers/:id`                 | 1     | Supplier detail                      |
| PUT    | `/suppliers/:id`                 | 1     | Update supplier                      |
| GET    | `/suppliers/:id/ledger`          | 1     | Supplier ledger entries              |
| POST   | `/suppliers/:id/payments`        | 1     | Record payment to supplier           |
| GET    | `/suppliers/:id/products`        | 1     | Products supplied by this supplier   |

### 5.11 Customers

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| GET    | `/customers`                     | 1     | List customers                       |
| POST   | `/customers`                     | 1     | Create customer                      |
| GET    | `/customers/:id`                 | 1     | Customer detail                      |
| PUT    | `/customers/:id`                 | 1     | Update customer                      |
| GET    | `/customers/:id/ledger`          | 1     | Customer khata ledger                |
| POST   | `/customers/:id/payments`        | 1     | Record payment from customer         |
| GET    | `/customers/search`              | 1     | Search by phone (for POS quick-add)  |

### 5.12 Cash Register

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| POST   | `/cash-register/open`            | 1     | Open register with opening balance   |
| GET    | `/cash-register/current`         | 1     | Current open register for user       |
| GET    | `/cash-register/:id`             | 1     | Register detail with all entries     |
| POST   | `/cash-register/:id/close`       | 1     | Close register with counted cash     |
| GET    | `/cash-register/history`         | 1     | Past register records                |

### 5.13 Expenses

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| GET    | `/expenses`                      | 2     | List expenses                        |
| POST   | `/expenses`                      | 2     | Create expense                       |
| GET    | `/expenses/:id`                  | 2     | Expense detail                       |
| PUT    | `/expenses/:id`                  | 2     | Update expense                       |
| DELETE | `/expenses/:id`                  | 2     | Delete expense                       |
| GET    | `/expenses/categories`           | 2     | List expense categories              |

### 5.14 GST

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| GET    | `/gst/summary`                   | 2     | GST dashboard data (scheme-dependent)|
| GET    | `/gst/gstr1`                     | 2     | GSTR-1 outward supply data           |
| GET    | `/gst/gstr3b`                    | 2     | GSTR-3B summary                      |
| GET    | `/gst/cmp08`                     | 2     | CMP-08 quarterly data                |
| GET    | `/gst/gstr4`                     | 2     | GSTR-4 annual data                   |
| GET    | `/gst/itc`                       | 2     | ITC register (Regular only)          |
| GET    | `/gst/hsn-summary`               | 2     | HSN-wise summary                     |

### 5.15 Reports

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| GET    | `/reports/:type`                 | 2     | Fetch report data. `type` = `daily-sales`, `sales-by-category`, `sales-by-salesperson`, `inventory-valuation`, `aging-inventory`, `low-stock`, `dead-stock`, `supplier-ledger`, `customer-ledger`, `outstanding-payables`, `outstanding-receivables`, `pnl`, `bargain-discount`, `cash-register`, `gst-summary`, `purchase-summary`, `expense` |
| POST   | `/reports/:type/export`          | 2     | Queue PDF/Excel export. Returns job ID |
| GET    | `/reports/export/:jobId`         | 2     | Download exported file               |

### 5.16 Dashboard

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| GET    | `/dashboard`                     | 1     | Role-dependent dashboard data. Returns KPIs, charts, action lists as a single aggregated payload |

### 5.17 Notifications

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| GET    | `/notifications`                 | 3     | List notifications (paginated)       |
| PATCH  | `/notifications/:id/read`        | 3     | Mark as read                         |
| PATCH  | `/notifications/read-all`        | 3     | Mark all as read                     |
| GET    | `/notifications/unread-count`    | 3     | Badge count                          |

### 5.18 Audit Log

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| GET    | `/audit-log`                     | 2     | Filterable audit log (owner only)    |

### 5.19 Labels

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| POST   | `/labels/generate`               | 1     | Generate printable label sheet (PDF/HTML). Input: array of `{product_id, quantity}` |
| GET    | `/labels/templates`              | 1     | List available label templates       |
| POST   | `/labels/templates`              | 3     | Create custom label template         |
| PUT    | `/labels/templates/:id`          | 3     | Update label template                |

### 5.20 Sync Conflicts

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| GET    | `/sync-conflicts`                | 3     | List unresolved conflicts            |
| POST   | `/sync-conflicts/:id/resolve`    | 3     | Resolve conflict (force_accept / edit / void) |
| GET    | `/sync-conflicts/count`          | 3     | Unresolved count (for badge)         |

### 5.21 Super Admin (Phase 4)

| Method | Endpoint                         | Phase | Description                          |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| GET    | `/admin/dashboard`               | 4     | Aggregate metrics                    |
| GET    | `/admin/tenants`                 | 4     | List all tenants                     |
| GET    | `/admin/tenants/:id`             | 4     | Tenant detail + usage                |
| PATCH  | `/admin/tenants/:id`             | 4     | Update tenant (suspend, plan change) |

---

## 6. Business Logic Rules

Critical rules the backend **must enforce**, regardless of what the frontend sends.

### 6.1 Billing (POST `/bills`)

1. **Atomic transaction**: bill + bill_items + bill_payments + stock_entries + ledger_entries + cash_register_entries all succeed or all fail (database transaction)
2. **Payment must balance**: `SUM(bill_payments.amount) = bill.net_amount`. Reject if unbalanced
3. **Credit requires customer**: if any `bill_payment.mode = credit`, `customer_id` is required
4. **Salesperson discount limit**: if `role = salesperson` and `additional_discount > tenant.settings.max_salesperson_discount`, reject with error code `DISCOUNT_LIMIT_EXCEEDED`
5. **Stock decrement**: create negative `StockEntry` for each bill item. Allow negative stock (don't block sale) but flag as discrepancy
6. **Cost price snapshot**: copy current `product.cost_price` into `bill_item.cost_price` at sale time
7. **Bill number**: auto-generated via sequence (see Section 12)
8. **GST scheme snapshot**: store `tenant.gst_scheme` at time of sale in `bill.gst_scheme_at_sale`
9. **GST back-calculation** (Regular): compute CGST/SGST from inclusive price per item (see Section 11)

### 6.2 Returns (POST `/returns`)

1. Refund values **always** from original `BillItem` — never from current `Product` master
2. `returned_qty` on `BillItem` cannot exceed original `quantity`
3. Stock entries: positive `StockEntry` with type `return_customer`
4. If `refund_mode = credit_note`, create positive `LedgerEntry` for customer (store credit)
5. If outside return window and `role != owner/manager`, reject
6. Update `bill.status` to `returned` or `partially_returned`

### 6.3 Purchases (POST `/purchases`)

1. **Atomic**: purchase + items + stock_entries + ledger_entry (supplier payable) + avg cost update
2. **Average cost recalculation**:
   - If `old_qty > 0`: `new_avg = ((old_avg * old_qty) + (purchase_cost * purchase_qty)) / (old_qty + purchase_qty)`
   - If `old_qty <= 0` (negative stock or zero): `new_avg = purchase_cost` — the new purchase becomes the entire cost basis. This avoids divide-by-zero when stock is negative (which is allowed by the POS-wins offline sync rule) and resets the cost to the latest known purchase price
3. **ITC tracking** (Regular scheme): create ITC record with CGST, SGST, IGST amounts from purchase
4. **Composition scheme**: GST on purchase absorbed into `cost_price`. No ITC record created
5. Update `supplier.outstanding_balance`
6. If against PO, update `PurchaseOrderItem.received_qty` and PO status

### 6.4 Credit/Payment Recording

1. Payment creates `LedgerEntry` with `entry_type = payment`
2. Recalculate and update `customer.outstanding_balance` or `supplier.outstanding_balance`
3. Cash payments: create `CashRegisterEntry` for the active register

### 6.5 Composition Scheme Guards

1. If `tenant.gst_scheme = composition`, reject any bill where customer address is out-of-state (inter-state sale blocked)
2. Block e-commerce integration activation (Phase 5) if scheme is composition

### 6.6 Product Deletion — Soft-Delete Only

**Products are never hard-deleted. `DELETE /products/:id` sets `is_active = false` (archive).**

Why this is critical:
- **Offline sync safety**: if a salesperson sells a product offline and the manager archives that product before sync, the sync must still succeed. Archived products retain all their data (SKU, barcode, name, prices), so the bill can be created with valid snapshots. If products were hard-deleted, the sync would fail with no resolution UI until Phase 3
- **Historical integrity**: bill_items snapshot product data, but reports and ledger queries may still JOIN to the product table for filtering/grouping. Archived products remain queryable
- **Return processing**: returns reference original bill_items which reference products. The product must exist for the return chain to resolve

Archived products are:
- Excluded from POS search and product lists by default (`WHERE is_active = true`)
- Still returned when queried by exact ID or barcode (for bill lookups, returns, sync)
- Included in historical reports

---

## 7. Offline Sync Protocol

### 7.1 Sync Endpoint: POST `/bills/sync`

**Request:** Array of offline bills, each with a client-generated UUID and `offline_created_at` timestamp.

```json
{
  "bills": [
    {
      "client_id": "uuid-from-device",
      "offline_created_at": "2026-03-29T14:30:00Z",
      "items": [ { "product_id": "...", "quantity": 2, "unit_price": 500 } ],
      "payments": [ { "mode": "cash", "amount": 1000 } ],
      "customer_id": null,
      "additional_discount_amount": 0
    }
  ]
}
```

### 7.2 Server Processing (per bill, in order of `offline_created_at`)

1. **Validate products exist**: products are soft-delete only (Section 6.6), so archived products still resolve. Sync succeeds even if the product was archived while offline. If a product ID is genuinely invalid (corrupted data), flag as sync conflict
2. **Validate customer exists** (if provided): customers are also soft-delete only. Invalid ID → flag as conflict
3. **Attempt bill creation** using standard POST `/bills` logic
4. **If stock goes negative**: ACCEPT the bill anyway (POS wins). Create stock discrepancy notification
5. **If any hard validation fails** (data corruption, payment imbalance, invalid UUIDs): create `SyncConflict` record, skip this bill. In practice, with soft-delete-only entities, conflicts should be rare and limited to data corruption edge cases

### 7.3 Response

```json
{
  "synced": [
    { "client_id": "...", "server_bill_id": "...", "bill_number": "KVB-2026-00042" }
  ],
  "conflicts": [
    { "client_id": "...", "conflict_id": "...", "reason": "Product MVT-RPA-RN-L-001 no longer exists" }
  ]
}
```

### 7.4 Idempotency

- `client_id` serves as idempotency key. If a bill with the same `client_id` already exists, return the existing `server_bill_id` without creating a duplicate
- This handles network retries after sync

**Future note:** As the system scales toward Phase 5 (payment gateways, e-commerce), idempotency should be standardized across **all state-mutating endpoints** — not just offline sync. The recommended approach: accept an `X-Idempotency-Key` header on any POST that creates a financial transaction (bill creation, payment recording, purchase recording, expense creation). Store the key + response in a short-lived cache (Redis, 24hr TTL). On duplicate key, return the cached response. This prevents double charges if a mobile device drops connectivity mid-request. Design the database schema for idempotency keys early (even if enforcement is Phase 3+), so it doesn't require a migration later

---

## 8. Background Jobs & Scheduled Tasks

| Job                          | Trigger                 | Phase | Description                                                |
| ---------------------------- | ----------------------- | ----- | ---------------------------------------------------------- |
| **Bulk Import Processor**    | On file upload          | 1     | Parse CSV/Excel, validate rows, create products in batch. Update job status. Send notification on completion |
| **Report Export**            | On user request         | 2     | Generate PDF/Excel for a report. Store in S3. Notify user with download link |
| **PO PDF Generation**       | On PO send              | 2     | Generate purchase order PDF. Attach to PO record           |
| **Recurring Expense Creator**| Daily at midnight       | 2     | Find expenses with `is_recurring = true` and create new entries on schedule |
| **Low Stock Check**          | Hourly (or on stock change) | 3  | Compare stock against min levels. Create notifications for items below threshold |
| **Supplier Payment Reminders** | Daily at 9 AM         | 3     | Find `LedgerEntry` records with `due_date` within 3 days or overdue. Create notifications |
| **Aging Inventory Digest**   | Weekly (Monday 8 AM)   | 3     | Find products with oldest `StockEntry` beyond aging threshold. Create notification |
| **Daily Sales Summary**      | Daily at store close (configurable) | 3 | Aggregate day's sales, cash register status. Create notification |
| **Stale Held Bills Cleanup** | Daily at midnight       | 3     | Delete held bills older than 24 hours                      |
| **Audit Log Partition**      | Monthly                 | 2     | Create next month's audit_log partition                    |

---

## 9. File Storage

### 9.1 Storage Structure

All files stored in S3-compatible storage. Organized by tenant:

```
/{tenant_id}/products/{product_id}/{filename}
/{tenant_id}/purchases/{purchase_id}/invoice.{ext}
/{tenant_id}/expenses/{expense_id}/receipt.{ext}
/{tenant_id}/exports/{job_id}/{filename}
/{tenant_id}/labels/{job_id}/labels.pdf
/tenants/{tenant_id}/logo.{ext}
```

### 9.2 Upload Flow

1. Frontend requests a **presigned upload URL** from the API: `POST /uploads/presign`
2. Frontend uploads directly to S3 using the presigned URL (no file data passes through the API server)
3. Frontend sends the resulting S3 key back to the API when saving the entity
4. API validates the key belongs to the correct tenant path

### 9.3 Constraints

- Max file size: 5 MB for images, 10 MB for invoice PDFs
- Allowed types: JPEG, PNG, WebP, PDF
- Images: auto-generate thumbnails (200x200) via background job or on-upload lambda

---

## 10. Barcode & Label Generation

### 10.1 Barcode Generation

- Generate barcodes server-side on product creation (or on demand)
- Format: **Code-128** (supports alphanumeric, compact, widely compatible with scanners)
- Barcode value = `product.barcode` field (defaults to SKU if not manually set)
- Store generated barcode as SVG string or generate on-the-fly (Code-128 is trivial to generate)

### 10.2 Label Generation (POST `/labels/generate`)

**Input:**
```json
{
  "template_id": "default",
  "items": [
    { "product_id": "...", "quantity": 50 },
    { "product_id": "...", "quantity": 30 }
  ]
}
```

**Processing:**
1. Fetch product data for all requested IDs
2. Render label layout using template (HTML/CSS → PDF via headless renderer, or direct PDF library)
3. Each label includes: barcode image, product name, size, price, SKU
4. Arrange labels on page according to template (e.g., 3x10 grid for A4, single label for thermal)
5. Return PDF URL or stream

---

## 11. GST Calculation Engine

### 11.1 Regular Scheme — Back-Calculation from Inclusive Price

For a product with selling price ₹550 (inclusive) and GST rate 5%:

```
taxable_value = selling_price / (1 + gst_rate/100)
             = 550 / 1.05 = 523.81

total_gst = selling_price - taxable_value = 26.19
cgst = total_gst / 2 = 13.10
sgst = total_gst / 2 = 13.10
```

Round to 2 decimal places at each line item. Rounding differences absorbed in the last line item.

### 11.2 Composition Scheme — Quarterly Turnover Tax

- No per-item tax calculation
- At quarter-end: `tax = total_quarterly_revenue * 0.01`
- Split: CGST = 50%, SGST = 50%
- Backend provides: `GET /gst/cmp08?quarter=Q4&fy=2025-26` → returns turnover and calculated tax

### 11.3 ITC Calculation (Regular Only)

On each purchase recording:
```
input_cgst = purchase.cgst_amount
input_sgst = purchase.sgst_amount
input_igst = purchase.igst_amount
```

Net liability for GSTR-3B:
```
output_tax (from sales) - input_tax (from purchases) = net payable
```

If input > output, carry forward as ITC balance.

---

## 12. Bill Number Generation

### 12.1 Requirements

- Sequential, gap-free within a tenant
- Financial year aware: resets (or continues) per FY
- Format: `{prefix}-{FY}-{sequence}` e.g., `KVB-2026-00001`
- Must be safe under concurrent POS usage (multiple salespeople billing simultaneously)

### 12.2 Implementation

Use a **database sequence table** per tenant:

```sql
CREATE TABLE bill_sequences (
  tenant_id UUID PRIMARY KEY,
  financial_year VARCHAR(9),  -- "2025-2026"
  last_number INTEGER DEFAULT 0
);
```

On bill creation:
```sql
UPDATE bill_sequences
SET last_number = last_number + 1
WHERE tenant_id = ? AND financial_year = ?
RETURNING last_number;
```

The `UPDATE ... RETURNING` is atomic and handles concurrency via row-level locking. Format: `{prefix}-{FY_short}-{padded_number}`.

Same pattern for `po_number`, `return_number`, and other sequences.

---

## 13. Report Queries

Each report is a server-side SQL query with date range and tenant filtering. Results are paginated and optionally cached.

| Report                  | Core Query Logic                                                   |
| ----------------------- | ------------------------------------------------------------------ |
| **Daily Sales**         | `SUM(net_amount)`, `COUNT(*)`, grouped by payment mode from `bills + bill_payments` for date range |
| **Sales by Category**   | JOIN `bill_items → products → categories`. GROUP BY category. SUM revenue |
| **Sales by Salesperson**| GROUP BY `bill.salesperson_id`. SUM revenue, COUNT bills            |
| **Inventory Valuation** | `SUM(current_stock * cost_price)` across all products              |
| **Aging Inventory**     | Find products where earliest unreturned positive `StockEntry.created_at` exceeds threshold |
| **Low Stock**           | Products where `current_stock < min_stock_level`                   |
| **Dead Stock**          | Products with zero `bill_items` in configurable period             |
| **Supplier Ledger**     | `LedgerEntry WHERE party_type = supplier AND party_id = ?` ordered by date |
| **Customer Ledger**     | `LedgerEntry WHERE party_type = customer AND party_id = ?` ordered by date |
| **Outstanding Payables**| `suppliers WHERE outstanding_balance > 0` with aging buckets       |
| **Outstanding Receivables** | `customers WHERE outstanding_balance > 0` with aging buckets  |
| **P&L**                 | Revenue (`SUM bills.net_amount`) - COGS (`SUM bill_items.cost_price * qty`) - Expenses (`SUM expenses.amount`) |
| **Bargain Discount**    | `SUM(bill.additional_discount_amount)` grouped by salesperson/period |
| **Cash Register**       | All `CashRegisterEntry` for a register, with opening/closing/discrepancy |
| **GST Summary**         | Scheme-dependent: Regular = output tax - ITC; Composition = 1% of turnover |
| **Purchase Summary**    | `SUM(purchases.total_amount)` grouped by supplier, category, period |
| **Expense Report**      | `SUM(expenses.amount)` grouped by category and period              |

---

## 14. Notification System

### 14.1 In-App Notifications

- Stored in `Notification` table
- Created by background jobs or inline during API operations (e.g., stock discrepancy on bill creation)
- Fetched via `GET /notifications` (polling from frontend) or via WebSocket/SSE push (Phase 3+)
- Badge count via `GET /notifications/unread-count`

### 14.2 Push Notifications (Phase 3)

- Web Push API via service worker (PWA)
- Store push subscription per user-device
- Background jobs send push alongside in-app notification

### 14.3 WhatsApp / SMS (Phase 4)

- Bill share: generate bill PDF → send via WhatsApp Business API
- Payment reminders: template message with customer name + amount → WhatsApp/SMS

---

## 15. Audit Logging

### 15.1 What Gets Logged

Every write operation on tenant data. Implemented as middleware/interceptor that fires after successful DB commits.

**Always log:** entity create, update, delete, bill void, stock adjustment, price change, discount override, payment recording, user login/logout, settings change.

**Never log:** read-only operations, search queries, report views.

### 15.2 Storage Strategy

- Append-only table, partitioned by month (`audit_log_2026_03`, `audit_log_2026_04`, ...)
- Retention: 2 years minimum. Drop partitions older than retention period
- Old/new values stored as JSONB — only changed fields in `old_value`/`new_value`, not full entity snapshots
- Indexed on `(tenant_id, created_at DESC)` for dashboard queries and `(tenant_id, entity_type, entity_id)` for per-entity history

---

## 16. Caching Strategy

| Data                       | Cache Layer | TTL       | Invalidation                          |
| -------------------------- | ----------- | --------- | ------------------------------------- |
| Product catalog (for POS)  | Redis       | 5 min     | On product create/update/delete       |
| Product search results     | Redis       | 1 min     | On product change                     |
| Dashboard KPIs             | Redis       | 30 sec    | On bill creation, payment recording   |
| Current stock counts       | Redis       | On write  | Updated on every stock entry          |
| Tenant settings            | Redis       | 10 min    | On settings update                    |
| User session / JWT         | Redis       | Token TTL | On logout / password change           |
| Report results             | None (Ph1)  | —         | Reports always query fresh in Phase 1. See performance note below |

**Report performance note:** The P&L report and dashboard KPIs require heavy aggregations across `bills`, `bill_items`, and `expenses`. If the owner frequently refreshes the dashboard during peak billing hours, these queries will compete with POS writes on the same database. **Monitor query times from Phase 1 launch.** If report queries exceed the 5-second target or POS latency degrades, introduce one or more of these mitigations (in escalation order):
1. **Materialized views** for the heaviest aggregations (daily sales totals, inventory valuation). Refresh on a schedule (every 5 min) or on demand
2. **Dashboard query caching** in Redis (30-second TTL, already in the table above) — avoids re-running the same aggregation on every page load
3. **Read replica** — route all report and dashboard queries to a PostgreSQL streaming replica. POS writes go to the primary. This is the cleanest long-term separation but adds infrastructure complexity

**Cache key format:** `tenant:{tenant_id}:{entity}:{identifier}`

Example: `tenant:abc123:product:search:rupa` or `tenant:abc123:dashboard:kpis`

---

## 17. Error Handling

### 17.1 Error Codes

| Code                        | HTTP Status | When                                              |
| --------------------------- | ----------- | ------------------------------------------------- |
| `VALIDATION_ERROR`          | 400         | Invalid input (missing fields, wrong format)      |
| `DUPLICATE_ENTRY`           | 409         | SKU, barcode, phone already exists in tenant      |
| `NOT_FOUND`                 | 404         | Entity doesn't exist or not in this tenant        |
| `UNAUTHORIZED`              | 401         | Missing or expired token                          |
| `FORBIDDEN`                 | 403         | Role doesn't have permission                      |
| `DISCOUNT_LIMIT_EXCEEDED`   | 403         | Salesperson exceeded max discount                 |
| `RETURN_WINDOW_EXPIRED`     | 422         | Return attempted outside window                   |
| `INTER_STATE_BLOCKED`       | 422         | Composition scheme — inter-state sale attempted   |
| `PAYMENT_UNBALANCED`        | 422         | Payment amounts don't match bill total            |
| `TENANT_SUSPENDED`          | 403         | Tenant account suspended                          |
| `IMPORT_FAILED`             | 422         | Bulk import has validation errors                 |
| `RATE_LIMITED`              | 429         | Too many requests                                 |
| `SYNC_CONFLICT`             | 409         | Offline bill cannot be synced (returned in batch) |

### 17.2 Validation

- Input validation at API layer (schema validation) — reject malformed requests before hitting business logic
- Business rule validation in service layer — check domain constraints
- Database constraints as final safety net (unique indexes, FK constraints, check constraints)

---

## 18. Rate Limiting

| Scope               | Limit                | Notes                                 |
| -------------------- | -------------------- | ------------------------------------- |
| Login attempts       | 5 per minute per IP  | Prevent brute force                   |
| OTP requests         | 3 per 10 minutes     | Prevent SMS abuse                     |
| API (per tenant)     | 100 req/sec          | General rate limit. Adjust per plan   |
| Bulk import          | 1 concurrent job     | Per tenant                            |
| Report export        | 3 concurrent jobs    | Per tenant                            |
| File upload          | 10 per minute        | Per user                              |

Implemented via Redis sliding window counters.

---

## 19. Backup & Data Export

### 19.1 Automated Backups

- **Database**: daily automated PostgreSQL `pg_dump`, stored in S3. Retain 30 days
- **File storage**: S3 versioning or daily sync to backup bucket
- **Point-in-time recovery**: enabled via PostgreSQL WAL archiving

### 19.2 Tenant Data Export

On request (`POST /settings/export-data`):
1. Queue background job
2. Generate CSV files per entity: products, stock, bills, bill_items, customers, suppliers, ledger, expenses
3. Package as ZIP
4. Store in S3, notify user with download link
5. Link valid for 24 hours

---

## 20. Phase Alignment

API endpoint count by phase:

| Phase | Endpoints | Focus                                              |
| ----- | --------- | -------------------------------------------------- |
| **1** | ~55       | Auth, setup, users, products, stock (read), POS billing, purchases (direct), suppliers, customers, ledger, cash register, dashboard, labels |
| **2** | ~30       | POs, purchase returns, stock adjustments/audit, GST, expenses, reports, audit log, bill void, export |
| **3** | ~15       | Held bills, returns, offline sync, sync conflicts, notifications, custom label templates, OTP |
| **4** | ~5        | Super admin, tenant management                     |

> **Phase 1 delivers ~55 endpoints** — covering the complete billing, inventory, and credit management flow needed for a functioning store.

---

*End of Document*

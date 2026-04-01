# Backend Tech Spec — InvenTrack

| Field            | Detail                                                    |
| ---------------- | --------------------------------------------------------- |
| **Document Version** | 1.0                                                   |
| **Date**         | 2026-03-31                                                |
| **Parent Docs**  | BRD.md v1.0, FRONTEND_BRD.md v1.0, BACKEND_BRD.md v1.0   |
| **Status**       | Draft                                                     |

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Project Structure](#2-project-structure)
3. [Database Schema](#3-database-schema)
4. [Multi-Tenancy Implementation](#4-multi-tenancy-implementation)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Request Lifecycle & Middleware](#6-request-lifecycle--middleware)
7. [Core Service Layer](#7-core-service-layer)
8. [Background Jobs](#8-background-jobs)
9. [File Storage](#9-file-storage)
10. [Caching](#10-caching)
11. [Testing Strategy](#11-testing-strategy)
12. [Database Migrations & Seeding](#12-database-migrations--seeding)
13. [Deployment & Infrastructure](#13-deployment--infrastructure)
14. [Monitoring & Observability](#14-monitoring--observability)
15. [Security Hardening](#15-security-hardening)
16. [Performance Optimizations](#16-performance-optimizations)
17. [Development Workflow](#17-development-workflow)

---

## 1. Tech Stack

### 1.1 Core

| Layer              | Technology              | Version  | Justification                                                     |
| ------------------ | ----------------------- | -------- | ----------------------------------------------------------------- |
| **Runtime**        | Node.js                 | 22 LTS   | Non-blocking I/O, excellent for API servers; large ecosystem; team can share TypeScript with frontend |
| **Language**       | TypeScript              | 5.5+     | Type safety across the full stack; catch errors at compile time; better IDE support; self-documenting code |
| **Framework**      | Hono                    | 4.x      | Lightweight, fast, built for edge and Node; middleware-first; first-class TypeScript support; cleaner than Express, less magic than NestJS |
| **Database**       | PostgreSQL              | 16       | JSONB for flexible settings, GIN indexes for full-text search, partitioning for audit logs, window functions for ledger queries, row-level locking for sequences, mature ecosystem |
| **ORM / Query**    | Drizzle ORM             | Latest   | Type-safe SQL, not an abstraction leak; generates clean SQL; supports raw queries when needed; lightweight; excellent PostgreSQL support |
| **Migrations**     | Drizzle Kit             | Latest   | Generates migration SQL from schema changes; version-controlled; rollback support |
| **Validation**     | Zod                     | 3.x      | Runtime schema validation; integrates with TypeScript types; used for API input validation and JSONB shape validation |
| **Cache / Queue**  | Redis                   | 7.x      | Session store, cache, rate limiting, background job queue (via BullMQ) |
| **Job Queue**      | BullMQ                  | 5.x      | Redis-backed; reliable; retries, cron scheduling, concurrency control; dashboard (Bull Board) for monitoring |
| **File Storage**   | AWS S3 / MinIO          | —        | S3-compatible API; MinIO for local dev and self-hosted deployments |
| **PDF Generation** | Puppeteer (or Playwright) | Latest | Headless Chromium for rendering HTML labels and invoices to PDF    |
| **Barcode**        | bwip-js                 | Latest   | Pure JS barcode generation (Code-128, EAN-13); no native dependencies; generates SVG/PNG |
| **Decimal Math**   | decimal.js              | Latest   | **All monetary calculations** must use this library. JavaScript IEEE 754 floats are imprecise (e.g., `0.1 + 0.2 = 0.30000000000000004`). In a retail system with GST back-calculations, native floats will cause penny-rounding ledger mismatches. See Section 7.5 |
| **Email**          | Nodemailer + AWS SES    | —        | SES for production; Nodemailer for abstraction and local dev (Ethereal/Mailtrap) |

### 1.2 Dev & Build

| Tool               | Purpose                                                    |
| ------------------ | ---------------------------------------------------------- |
| **tsx**            | Fast TypeScript execution in development (no compile step) |
| **tsup**           | Bundle for production (ESM, tree-shaking)                  |
| **Vitest**         | Unit and integration testing (fast, native TypeScript, Jest-compatible API) |
| **Supertest**      | HTTP assertion library for API integration tests           |
| **Testcontainers** | Spin up real PostgreSQL + Redis in Docker for integration tests |
| **ESLint**         | Linting with flat config                                   |
| **Prettier**       | Code formatting                                            |
| **Husky + lint-staged** | Pre-commit hooks for lint + format                   |
| **Docker**         | Containerized development and deployment                   |
| **Docker Compose** | Local dev stack (API + PostgreSQL + Redis + MinIO)         |
| **GitHub Actions** | CI/CD pipeline                                             |

### 1.3 Why Not [Alternative]?

| Rejected            | Why                                                        |
| ------------------- | ---------------------------------------------------------- |
| Express             | Aging middleware patterns, no native TypeScript, Hono is faster and cleaner |
| NestJS              | Too much boilerplate and decorator magic for this project size; adds complexity without proportional benefit |
| Prisma              | Generates a heavy client; query abstractions can be limiting for complex SQL (window functions, CTEs); Drizzle is closer to SQL |
| Sequelize           | Legacy patterns, poor TypeScript support                   |
| MongoDB             | Relational data (ledgers, stock entries, bills with items) is a better fit for PostgreSQL. JSONB gives us document flexibility where needed |
| SQLite              | No concurrent writes for multiple POS stations, no partitioning, not suitable for multi-tenant SaaS |

---

## 2. Project Structure

```
inventrack/
├── apps/
│   └── api/                          # Backend API application
│       ├── src/
│       │   ├── index.ts              # App entry point — creates Hono app, registers routes
│       │   ├── server.ts             # HTTP server bootstrap (listen, graceful shutdown)
│       │   │
│       │   ├── config/               # Configuration
│       │   │   ├── env.ts            # Environment variables (Zod-validated)
│       │   │   ├── database.ts       # PostgreSQL connection pool config
│       │   │   ├── redis.ts          # Redis client config
│       │   │   └── s3.ts             # S3/MinIO client config
│       │   │
│       │   ├── db/                   # Database layer
│       │   │   ├── schema/           # Drizzle schema definitions (1 file per entity)
│       │   │   │   ├── tenants.ts
│       │   │   │   ├── users.ts
│       │   │   │   ├── products.ts
│       │   │   │   ├── stock-entries.ts
│       │   │   │   ├── bills.ts
│       │   │   │   ├── bill-items.ts
│       │   │   │   ├── bill-payments.ts
│       │   │   │   ├── returns.ts
│       │   │   │   ├── purchases.ts
│       │   │   │   ├── purchase-orders.ts
│       │   │   │   ├── suppliers.ts
│       │   │   │   ├── customers.ts
│       │   │   │   ├── ledger-entries.ts
│       │   │   │   ├── expenses.ts
│       │   │   │   ├── cash-registers.ts
│       │   │   │   ├── notifications.ts
│       │   │   │   ├── audit-logs.ts
│       │   │   │   ├── sync-conflicts.ts
│       │   │   │   ├── bill-sequences.ts
│       │   │   │   └── index.ts      # Re-exports all schemas
│       │   │   ├── migrations/       # Generated SQL migration files
│       │   │   ├── seed/             # Seed data (default categories, size systems)
│       │   │   │   ├── defaults.ts   # Default categories, sub-types, size systems
│       │   │   │   └── dev-seed.ts   # Dev/test data
│       │   │   └── client.ts         # Drizzle client instance
│       │   │
│       │   ├── middleware/           # Hono middleware
│       │   │   ├── auth.ts           # JWT verification, extract user + tenant
│       │   │   ├── tenant-scope.ts   # Inject tenant_id into all queries
│       │   │   ├── rbac.ts           # Role-based access guard
│       │   │   ├── rate-limit.ts     # Redis-based rate limiting
│       │   │   ├── request-id.ts     # Generate unique request ID for tracing
│       │   │   ├── error-handler.ts  # Global error handler (catch-all)
│       │   │   ├── audit.ts          # Audit logging middleware
│       │   │   └── validate.ts       # Zod schema validation helper
│       │   │
│       │   ├── routes/               # Route definitions (1 file per module)
│       │   │   ├── auth.routes.ts
│       │   │   ├── setup.routes.ts
│       │   │   ├── users.routes.ts
│       │   │   ├── categories.routes.ts
│       │   │   ├── products.routes.ts
│       │   │   ├── stock.routes.ts
│       │   │   ├── bills.routes.ts
│       │   │   ├── returns.routes.ts
│       │   │   ├── purchases.routes.ts
│       │   │   ├── purchase-orders.routes.ts
│       │   │   ├── suppliers.routes.ts
│       │   │   ├── customers.routes.ts
│       │   │   ├── cash-register.routes.ts
│       │   │   ├── expenses.routes.ts
│       │   │   ├── gst.routes.ts
│       │   │   ├── reports.routes.ts
│       │   │   ├── dashboard.routes.ts
│       │   │   ├── notifications.routes.ts
│       │   │   ├── audit-log.routes.ts
│       │   │   ├── labels.routes.ts
│       │   │   ├── sync-conflicts.routes.ts
│       │   │   ├── uploads.routes.ts
│       │   │   ├── admin.routes.ts
│       │   │   └── index.ts          # Register all routes on the Hono app
│       │   │
│       │   ├── services/             # Business logic (1 file per domain)
│       │   │   ├── auth.service.ts
│       │   │   ├── tenant.service.ts
│       │   │   ├── user.service.ts
│       │   │   ├── product.service.ts
│       │   │   ├── stock.service.ts
│       │   │   ├── billing.service.ts       # The core POS billing logic
│       │   │   ├── return.service.ts
│       │   │   ├── purchase.service.ts
│       │   │   ├── purchase-order.service.ts
│       │   │   ├── supplier.service.ts
│       │   │   ├── customer.service.ts
│       │   │   ├── ledger.service.ts        # Shared ledger operations
│       │   │   ├── cash-register.service.ts
│       │   │   ├── expense.service.ts
│       │   │   ├── gst.service.ts           # GST calculation engine
│       │   │   ├── report.service.ts
│       │   │   ├── dashboard.service.ts
│       │   │   ├── notification.service.ts
│       │   │   ├── audit.service.ts
│       │   │   ├── barcode.service.ts
│       │   │   ├── label.service.ts
│       │   │   ├── sync.service.ts          # Offline sync + conflict handling
│       │   │   ├── import.service.ts        # CSV/Excel bulk import
│       │   │   └── bill-number.service.ts   # Sequence management
│       │   │
│       │   ├── jobs/                 # Background job definitions
│       │   │   ├── worker.ts         # BullMQ worker bootstrap
│       │   │   ├── queues.ts         # Queue definitions
│       │   │   ├── bulk-import.job.ts
│       │   │   ├── report-export.job.ts
│       │   │   ├── po-pdf.job.ts
│       │   │   ├── recurring-expense.job.ts
│       │   │   ├── low-stock-check.job.ts
│       │   │   ├── payment-reminders.job.ts
│       │   │   ├── aging-inventory.job.ts
│       │   │   ├── daily-summary.job.ts
│       │   │   ├── held-bills-cleanup.job.ts
│       │   │   └── audit-partition.job.ts
│       │   │
│       │   ├── lib/                  # Shared utilities
│       │   │   ├── errors.ts         # Custom error classes (AppError, ValidationError, etc.)
│       │   │   ├── response.ts       # Standard response helpers (success, error, paginated)
│       │   │   ├── pagination.ts     # Cursor and offset pagination helpers
│       │   │   ├── gst-calculator.ts # GST back-calculation functions
│       │   │   ├── indian-format.ts  # Indian number formatting (₹12,34,567.00)
│       │   │   ├── date-utils.ts     # Financial year helpers, quarter detection
│       │   │   └── constants.ts      # Enums, default values, config constants
│       │   │
│       │   └── types/                # Shared TypeScript types
│       │       ├── context.ts        # Hono context type with tenant + user
│       │       ├── api.ts            # Request/response DTOs
│       │       └── enums.ts          # Union types matching DB enums
│       │
│       ├── drizzle.config.ts         # Drizzle Kit config (migrations, schema path)
│       ├── tsconfig.json
│       ├── package.json
│       └── Dockerfile
│
├── docker-compose.yml                # PostgreSQL + Redis + MinIO + API
├── .env.example                      # Environment variables template
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint + Test + Type-check on PR
│       └── deploy.yml                # Build + Deploy on merge to main
├── turbo.json                        # Turborepo config (if monorepo with frontend)
└── README.md
```

### 2.1 Key Conventions

- **One file per entity** in `db/schema/` — keeps schema changes scoped
- **One file per domain** in `services/` — all business logic lives here, not in routes
- **Routes are thin** — validate input, call service, return response. No business logic in routes
- **No barrel exports** except in `db/schema/index.ts` and `routes/index.ts`
- **Naming**: `kebab-case` for files, `PascalCase` for types/schemas, `camelCase` for functions/variables

---

## 3. Database Schema

### 3.1 PostgreSQL Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- Trigram matching for fuzzy search
CREATE EXTENSION IF NOT EXISTS "btree_gist";   -- Required for exclusion constraints
```

### 3.2 Enum Types

```sql
CREATE TYPE gst_scheme_type AS ENUM ('regular', 'composition');
CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE tenant_plan AS ENUM ('free', 'basic', 'pro');
CREATE TYPE user_role AS ENUM ('owner', 'manager', 'salesperson');
CREATE TYPE stock_entry_type AS ENUM ('purchase', 'sale', 'return_customer', 'return_supplier', 'adjustment', 'opening');
CREATE TYPE bill_status AS ENUM ('completed', 'returned', 'partially_returned', 'voided', 'held');
CREATE TYPE payment_mode AS ENUM ('cash', 'upi', 'card', 'credit');
CREATE TYPE general_payment_mode AS ENUM ('cash', 'upi', 'bank_transfer', 'cheque', 'card');
CREATE TYPE party_type AS ENUM ('customer', 'supplier');
CREATE TYPE ledger_entry_type AS ENUM ('sale', 'purchase', 'payment', 'return', 'adjustment', 'opening_balance');
CREATE TYPE po_status AS ENUM ('draft', 'sent', 'partially_received', 'received', 'cancelled');
CREATE TYPE refund_mode AS ENUM ('cash', 'credit_note', 'exchange');
CREATE TYPE register_status AS ENUM ('open', 'closed');
CREATE TYPE sync_conflict_status AS ENUM ('pending', 'force_accepted', 'edited', 'voided');
CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete', 'login', 'logout', 'void');
```

### 3.3 Core Tables

```sql
-- ============================================================
-- TENANT (not tenant-scoped)
-- ============================================================
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    address         TEXT,
    phone           VARCHAR(15),
    email           VARCHAR(255),
    logo_url        VARCHAR(500),
    gstin           VARCHAR(15),
    gst_scheme      gst_scheme_type NOT NULL DEFAULT 'regular',
    financial_year_start SMALLINT NOT NULL DEFAULT 4,
    invoice_prefix  VARCHAR(10) NOT NULL DEFAULT 'INV',
    settings        JSONB NOT NULL DEFAULT '{}',
    setup_complete  BOOLEAN NOT NULL DEFAULT false,
    status          tenant_status NOT NULL DEFAULT 'active',
    plan            tenant_plan NOT NULL DEFAULT 'free',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    phone           VARCHAR(15) NOT NULL,
    email           VARCHAR(255),
    password_hash   VARCHAR(255) NOT NULL,
    role            user_role NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, phone)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    code            VARCHAR(10) NOT NULL,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);

-- ============================================================
-- SUB-TYPES
-- ============================================================
CREATE TABLE sub_types (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id     UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    code            VARCHAR(10) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SIZE SYSTEMS
-- ============================================================
CREATE TABLE size_systems (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    values          JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE category_size_systems (
    category_id     UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    size_system_id  UUID NOT NULL REFERENCES size_systems(id) ON DELETE CASCADE,
    PRIMARY KEY (category_id, size_system_id)
);

-- ============================================================
-- BRANDS
-- ============================================================
CREATE TABLE brands (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    code            VARCHAR(10) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE products (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,
    sku                 VARCHAR(50) NOT NULL,
    barcode             VARCHAR(50),
    category_id         UUID NOT NULL REFERENCES categories(id),
    sub_type_id         UUID REFERENCES sub_types(id),
    brand_id            UUID REFERENCES brands(id),
    size                VARCHAR(20),
    color               VARCHAR(50),
    hsn_code            VARCHAR(8),
    gst_rate            DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    selling_price       DECIMAL(10,2) NOT NULL,
    cost_price          DECIMAL(10,2) NOT NULL DEFAULT 0,
    mrp                 DECIMAL(10,2),
    catalog_discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
    min_stock_level     INTEGER NOT NULL DEFAULT 10,
    reorder_point       INTEGER,
    description         TEXT,
    image_urls          JSONB NOT NULL DEFAULT '[]',
    current_stock       INTEGER NOT NULL DEFAULT 0,  -- trigger-maintained, see stock trigger below
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, sku),
    UNIQUE (tenant_id, barcode)
);

CREATE INDEX idx_products_tenant_category ON products(tenant_id, category_id);
CREATE INDEX idx_products_tenant_brand ON products(tenant_id, brand_id);
CREATE INDEX idx_products_tenant_active ON products(tenant_id, is_active);
CREATE INDEX idx_products_search ON products USING GIN (name gin_trgm_ops);

-- ============================================================
-- STOCK ENTRIES (append-only ledger)
-- ============================================================
CREATE TABLE stock_entries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id),
    quantity            INTEGER NOT NULL,  -- +ve = in, -ve = out
    type                stock_entry_type NOT NULL,
    reference_type      VARCHAR(50),
    reference_id        UUID,
    cost_price_at_entry DECIMAL(10,2),
    reason              VARCHAR(255),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_entries_product ON stock_entries(tenant_id, product_id);
CREATE INDEX idx_stock_entries_created ON stock_entries(tenant_id, created_at DESC);

-- ============================================================
-- STOCK TRIGGER: auto-update products.current_stock on every stock_entry insert
-- This replaces a materialized view — a trigger is O(1) per insert vs
-- a materialized view refresh that scans the entire stock_entries table.
-- Critical for POS latency: 3 concurrent salespeople billing must not
-- trigger a full-table scan on every sale.
-- ============================================================
CREATE OR REPLACE FUNCTION update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE products
    SET current_stock = current_stock + NEW.quantity
    WHERE id = NEW.product_id AND tenant_id = NEW.tenant_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_entry_update_product
    AFTER INSERT ON stock_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_product_stock();

-- ============================================================
-- BILLS
-- ============================================================
CREATE TABLE bills (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bill_number                 VARCHAR(30) NOT NULL,
    customer_id                 UUID REFERENCES customers(id),
    salesperson_id              UUID NOT NULL REFERENCES users(id),
    subtotal                    DECIMAL(12,2) NOT NULL,
    catalog_discount_total      DECIMAL(12,2) NOT NULL DEFAULT 0,
    additional_discount_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
    additional_discount_pct     DECIMAL(5,2) NOT NULL DEFAULT 0,
    tax_amount                  DECIMAL(12,2) NOT NULL DEFAULT 0,
    net_amount                  DECIMAL(12,2) NOT NULL,
    gst_scheme_at_sale          gst_scheme_type NOT NULL,
    status                      bill_status NOT NULL DEFAULT 'completed',
    is_offline                  BOOLEAN NOT NULL DEFAULT false,
    offline_created_at          TIMESTAMPTZ,
    client_id                   UUID,  -- idempotency key for offline sync
    notes                       TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, bill_number),
    UNIQUE (tenant_id, client_id)
);

CREATE INDEX idx_bills_tenant_created ON bills(tenant_id, created_at DESC);
CREATE INDEX idx_bills_tenant_customer ON bills(tenant_id, customer_id);
CREATE INDEX idx_bills_tenant_salesperson ON bills(tenant_id, salesperson_id);
CREATE INDEX idx_bills_tenant_status ON bills(tenant_id, status);

-- ============================================================
-- BILL ITEMS
-- ============================================================
CREATE TABLE bill_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_id             UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id),
    product_name        VARCHAR(255) NOT NULL,  -- snapshot
    sku                 VARCHAR(50) NOT NULL,    -- snapshot
    hsn_code            VARCHAR(8),              -- snapshot
    size                VARCHAR(20),             -- snapshot
    quantity            INTEGER NOT NULL,
    unit_price          DECIMAL(10,2) NOT NULL,  -- snapshot
    catalog_discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
    catalog_discount_amt DECIMAL(10,2) NOT NULL DEFAULT 0,
    gst_rate            DECIMAL(5,2) NOT NULL,   -- snapshot
    cgst_amount         DECIMAL(10,2) NOT NULL DEFAULT 0,
    sgst_amount         DECIMAL(10,2) NOT NULL DEFAULT 0,
    cost_price          DECIMAL(10,2) NOT NULL,  -- snapshot for profit calc
    line_total          DECIMAL(10,2) NOT NULL,
    returned_qty        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_bill_items_bill ON bill_items(bill_id);
CREATE INDEX idx_bill_items_product ON bill_items(product_id);

-- ============================================================
-- BILL PAYMENTS
-- ============================================================
CREATE TABLE bill_payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_id         UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    mode            payment_mode NOT NULL,
    amount          DECIMAL(10,2) NOT NULL,
    reference       VARCHAR(100)
);

CREATE INDEX idx_bill_payments_bill ON bill_payments(bill_id);

-- ============================================================
-- RETURNS
-- ============================================================
CREATE TABLE returns (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    original_bill_id    UUID NOT NULL REFERENCES bills(id),
    return_number       VARCHAR(30) NOT NULL,
    refund_mode         refund_mode NOT NULL,
    refund_amount       DECIMAL(10,2) NOT NULL,
    reason              VARCHAR(255),
    processed_by        UUID NOT NULL REFERENCES users(id),
    exchange_bill_id    UUID REFERENCES bills(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, return_number)
);

CREATE TABLE return_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_id       UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    bill_item_id    UUID NOT NULL REFERENCES bill_items(id),
    quantity        INTEGER NOT NULL,
    refund_amount   DECIMAL(10,2) NOT NULL
);

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================
CREATE TABLE purchase_orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    po_number       VARCHAR(30) NOT NULL,
    supplier_id     UUID NOT NULL REFERENCES suppliers(id),
    status          po_status NOT NULL DEFAULT 'draft',
    expected_total  DECIMAL(12,2) NOT NULL DEFAULT 0,
    notes           TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, po_number)
);

CREATE TABLE purchase_order_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    ordered_qty     INTEGER NOT NULL,
    received_qty    INTEGER NOT NULL DEFAULT 0,
    expected_cost   DECIMAL(10,2) NOT NULL
);

-- ============================================================
-- PURCHASES (Goods Receipt)
-- ============================================================
CREATE TABLE purchases (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    po_id               UUID REFERENCES purchase_orders(id),
    supplier_id         UUID NOT NULL REFERENCES suppliers(id),
    invoice_number      VARCHAR(50),
    invoice_date        DATE,
    invoice_image_url   VARCHAR(500),
    total_amount        DECIMAL(12,2) NOT NULL,
    cgst_amount         DECIMAL(10,2) NOT NULL DEFAULT 0,
    sgst_amount         DECIMAL(10,2) NOT NULL DEFAULT 0,
    igst_amount         DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_rcm              BOOLEAN NOT NULL DEFAULT false,
    created_by          UUID NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id     UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    quantity        INTEGER NOT NULL,
    cost_price      DECIMAL(10,2) NOT NULL,
    gst_rate        DECIMAL(5,2) NOT NULL DEFAULT 0,
    gst_amount      DECIMAL(10,2) NOT NULL DEFAULT 0
);

-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE suppliers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,
    contact_person      VARCHAR(255),
    phone               VARCHAR(15),
    email               VARCHAR(255),
    address             TEXT,
    gstin               VARCHAR(15),
    payment_terms       VARCHAR(100),
    notes               TEXT,
    outstanding_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,
    phone               VARCHAR(15) NOT NULL,
    email               VARCHAR(255),
    address             TEXT,
    outstanding_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_by          UUID REFERENCES users(id),
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, phone)
);

CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_customers_phone ON customers(tenant_id, phone);

-- ============================================================
-- LEDGER ENTRIES (shared for customer + supplier)
-- ============================================================
CREATE TABLE ledger_entries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    party_type          party_type NOT NULL,
    party_id            UUID NOT NULL,
    entry_type          ledger_entry_type NOT NULL,
    debit               DECIMAL(12,2) NOT NULL DEFAULT 0,
    credit              DECIMAL(12,2) NOT NULL DEFAULT 0,
    reference_type      VARCHAR(50),
    reference_id        UUID,
    payment_mode        general_payment_mode,
    payment_reference   VARCHAR(100),
    due_date            DATE,
    description         VARCHAR(255),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_party ON ledger_entries(tenant_id, party_type, party_id, created_at);

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE TABLE expenses (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category            VARCHAR(100) NOT NULL,
    amount              DECIMAL(10,2) NOT NULL,
    description         VARCHAR(255),
    expense_date        DATE NOT NULL,
    is_recurring        BOOLEAN NOT NULL DEFAULT false,
    recurrence_interval VARCHAR(20),
    receipt_image_url   VARCHAR(500),
    created_by          UUID NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CASH REGISTERS
-- ============================================================
CREATE TABLE cash_registers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id),
    register_date       DATE NOT NULL,
    opening_balance     DECIMAL(10,2) NOT NULL,
    calculated_closing  DECIMAL(10,2),
    actual_closing      DECIMAL(10,2),
    discrepancy         DECIMAL(10,2),
    status              register_status NOT NULL DEFAULT 'open',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_registers_user ON cash_registers(tenant_id, user_id, register_date);

CREATE TABLE cash_register_entries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    register_id     UUID NOT NULL REFERENCES cash_registers(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL,
    amount          DECIMAL(10,2) NOT NULL,
    reference_type  VARCHAR(50),
    reference_id    UUID,
    description     VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    type            VARCHAR(50) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    body            TEXT,
    data            JSONB,
    is_read         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(tenant_id, user_id, is_read, created_at DESC);

-- ============================================================
-- AUDIT LOGS (partitioned by month)
-- ============================================================
CREATE TABLE audit_logs (
    id              UUID NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL,
    user_id         UUID NOT NULL,
    action          audit_action NOT NULL,
    entity_type     VARCHAR(50) NOT NULL,
    entity_id       UUID,
    old_value       JSONB,
    new_value       JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Create initial partitions (background job creates future partitions)
CREATE TABLE audit_logs_2026_04 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE INDEX idx_audit_logs_tenant_date ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(tenant_id, entity_type, entity_id);

-- ============================================================
-- SYNC CONFLICTS
-- ============================================================
CREATE TABLE sync_conflicts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    submitted_by        UUID NOT NULL REFERENCES users(id),
    offline_bill_data   JSONB NOT NULL,
    conflict_reason     VARCHAR(255) NOT NULL,
    status              sync_conflict_status NOT NULL DEFAULT 'pending',
    resolved_by         UUID REFERENCES users(id),
    resolved_at         TIMESTAMPTZ,
    resolution_notes    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- BILL SEQUENCES (gap-free numbering)
-- ============================================================
CREATE TABLE bill_sequences (
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sequence_type   VARCHAR(20) NOT NULL,  -- 'bill', 'po', 'return'
    financial_year  VARCHAR(9) NOT NULL,   -- '2025-2026'
    last_number     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, sequence_type, financial_year)
);

-- ============================================================
-- REFRESH TOKENS (not tenant-scoped)
-- ============================================================
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ============================================================
-- UTILITY: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_purchase_orders_updated BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 3.4 Stock Tracking Strategy

Stock is tracked via the `stock_entries` append-only ledger (source of truth) and a **trigger-maintained `current_stock` column** on the `products` table (fast read path).

**Why a trigger instead of a materialized view:**
- A `REFRESH MATERIALIZED VIEW` scans the entire `stock_entries` table — even with `CONCURRENTLY`, this is O(n) and would spike DB CPU when 3 salespeople bill simultaneously
- The trigger is O(1) per stock entry insert — it simply increments/decrements `products.current_stock` by the entry's quantity
- POS reads `products.current_stock` directly — no aggregation needed at query time
- For auditing or reconciliation, the full truth is always available via `SELECT SUM(quantity) FROM stock_entries WHERE product_id = ?`

---

## 4. Multi-Tenancy Implementation

### 4.1 Tenant Context Type

```typescript
// src/types/context.ts
import type { Context } from 'hono';

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: 'owner' | 'manager' | 'salesperson';
}

export type AppContext = Context<{
  Variables: {
    tenant: TenantContext;
  };
}>;
```

### 4.2 Tenant Scoping in Queries

Every query function accepts `tenantId` as its first parameter. Enforced by convention and code review. Example:

```typescript
// src/services/product.service.ts
export async function listProducts(tenantId: string, filters: ProductFilters) {
  return db.select()
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),  // always first condition
        eq(products.isActive, true),
        filters.categoryId ? eq(products.categoryId, filters.categoryId) : undefined
      )
    )
    .orderBy(desc(products.createdAt))
    .limit(filters.limit)
    .offset(filters.offset);
}
```

A lint rule or code review checklist enforces: **every SELECT, UPDATE, DELETE on a tenant-scoped table MUST include `WHERE tenant_id = ?`**.

---

## 5. Authentication & Authorization

### 5.1 JWT Token Flow

```
Login Request                          Server
    │                                     │
    │─── POST /auth/login ───────────────▶│
    │    { phone, password }              │── verify password (bcrypt)
    │                                     │── generate access token (15 min)
    │                                     │── generate refresh token (7 days)
    │                                     │── store refresh_token hash in DB
    │◀── { accessToken, user } ──────────│
    │    Set-Cookie: refreshToken (httpOnly)
    │                                     │
    │─── GET /api/v1/products ───────────▶│
    │    Authorization: Bearer <access>   │── verify JWT signature + expiry
    │                                     │── extract { userId, tenantId, role }
    │◀── { data: [...] } ────────────────│
    │                                     │
    │─── POST /auth/refresh ─────────────▶│  (when access token expires)
    │    Cookie: refreshToken             │── verify refresh token hash in DB
    │                                     │── rotate: issue new access + refresh
    │                                     │── delete old refresh, store new
    │◀── { accessToken } ────────────────│
    │    Set-Cookie: refreshToken (new)   │
```

### 5.2 RBAC Middleware

```typescript
// src/middleware/rbac.ts
export function requireRole(...roles: UserRole[]) {
  return async (c: AppContext, next: () => Promise<void>) => {
    const { role } = c.get('tenant');
    if (!roles.includes(role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
    await next();
  };
}

// Usage in routes:
app.delete('/products/:id', requireRole('owner'), deleteProduct);
app.post('/bills', requireRole('owner', 'manager', 'salesperson'), createBill);
```

### 5.3 Field-Level Filtering

```typescript
// src/services/product.service.ts
export function serializeProduct(product: Product, role: UserRole) {
  const base = { id: product.id, name: product.name, sku: product.sku, /* ... */ };
  if (role === 'salesperson') {
    // Strip sensitive fields
    return base;
  }
  return { ...base, costPrice: product.costPrice };
}
```

---

## 6. Request Lifecycle & Middleware

### 6.1 Middleware Chain

```
Request
  │
  ▼
[1] request-id        → Generate unique X-Request-Id header
  │
  ▼
[2] rate-limit         → Check Redis counter, reject if exceeded
  │
  ▼
[3] auth               → Verify JWT, extract user/tenant context
  │                      (skipped for public routes: /auth/*)
  ▼
[4] tenant-scope       → Validate tenant status (active, not suspended)
  │
  ▼
[5] rbac               → Check role permission (per-route)
  │
  ▼
[6] validate           → Zod schema validation on request body/params/query
  │
  ▼
[7] Route Handler      → Call service, return response
  │
  ▼
[8] audit              → Log write operations to audit_logs (async, non-blocking)
  │
  ▼
[9] error-handler      → Catch any thrown errors, format standard error response
  │
  ▼
Response
```

### 6.2 Validation Pattern

```typescript
// src/middleware/validate.ts
import { z } from 'zod';

export function validate<T extends z.ZodSchema>(schema: T) {
  return async (c: AppContext, next: () => Promise<void>) => {
    const body = await c.req.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      throw new ValidationError(result.error.issues);
    }
    c.set('validatedBody', result.data);
    await next();
  };
}

// Usage:
const createBillSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1),
  payments: z.array(z.object({
    mode: z.enum(['cash', 'upi', 'card', 'credit']),
    amount: z.number().positive(),
  })).min(1),
  customerId: z.string().uuid().nullable(),
  additionalDiscountAmount: z.number().min(0).default(0),
  additionalDiscountPct: z.number().min(0).max(100).default(0),
});
```

---

## 7. Core Service Layer

### 7.1 Billing Service (Most Critical)

The `POST /bills` handler calls `billingService.createBill()`, which executes **everything in a single database transaction**:

```typescript
// src/services/billing.service.ts (pseudocode)
export async function createBill(tenantId: string, userId: string, role: UserRole, input: CreateBillInput) {
  try {
    return await _createBillTransaction(tenantId, userId, role, input);
  } catch (err) {
    // Idempotency: if a concurrent request already inserted this client_id,
    // PostgreSQL throws unique_violation (23505). Catch it and return the existing bill.
    if (input.clientId && isUniqueViolation(err, 'bills_tenant_id_client_id_key')) {
      const [existing] = await db.select()
        .from(bills)
        .where(and(eq(bills.tenantId, tenantId), eq(bills.clientId, input.clientId)))
        .limit(1);
      if (existing) return existing;
    }
    throw err; // re-throw all other errors
  }
}

// Helper: detect PostgreSQL unique violation on a specific constraint
function isUniqueViolation(err: unknown, constraintName: string): boolean {
  return err instanceof Error && 'code' in err && (err as any).code === '23505'
    && 'constraint' in err && (err as any).constraint === constraintName;
}

async function _createBillTransaction(tenantId: string, userId: string, role: UserRole, input: CreateBillInput) {
  return db.transaction(async (tx) => {
    // 1. Validate salesperson discount limit
    if (role === 'salesperson' && input.additionalDiscountAmount > 0) {
      const settings = await getTenantSettings(tx, tenantId);
      if (input.additionalDiscountAmount > settings.maxSalespersonDiscountAmount) {
        throw new ForbiddenError('DISCOUNT_LIMIT_EXCEEDED');
      }
    }

    // 2. Fetch all products and compute line items
    const lineItems = await Promise.all(input.items.map(async (item) => {
      const product = await getProduct(tx, tenantId, item.productId);
      const catalogDiscount = product.sellingPrice * (product.catalogDiscountPct / 100);
      const unitPriceAfterDiscount = product.sellingPrice - catalogDiscount;
      const lineTotal = unitPriceAfterDiscount * item.quantity;

      // GST back-calculation (Regular scheme)
      const gst = gstCalculator.backCalculate(unitPriceAfterDiscount, product.gstRate, tenant.gstScheme);

      return { product, quantity: item.quantity, lineTotal, gst, catalogDiscount };
    }));

    // 3. Compute totals (all monetary math via decimal.js — see Section 7.5)
    const subtotal = decimalSum(lineItems, l => new Decimal(l.product.sellingPrice).times(l.quantity));
    const catalogDiscountTotal = decimalSum(lineItems, l => new Decimal(l.catalogDiscount).times(l.quantity));
    const netAmount = subtotal.minus(catalogDiscountTotal).minus(input.additionalDiscountAmount).toDecimalPlaces(2);

    // 4. Validate payments balance
    const paymentTotal = decimalSum(input.payments, p => new Decimal(p.amount));
    if (!paymentTotal.equals(netAmount)) {
      throw new ValidationError('PAYMENT_UNBALANCED');
    }

    // 5. Credit requires customer
    if (input.payments.some(p => p.mode === 'credit') && !input.customerId) {
      throw new ValidationError('Credit payment requires a customer');
    }

    // 6. Generate bill number
    const billNumber = await billNumberService.next(tx, tenantId, 'bill');

    // 7. Snapshot GST scheme
    const tenant = await getTenant(tx, tenantId);

    // 8. Insert bill
    const [bill] = await tx.insert(bills).values({ /* ... */ }).returning();

    // 9. Insert bill items (with snapshots)
    for (const line of lineItems) {
      await tx.insert(billItems).values({ billId: bill.id, costPrice: line.product.costPrice, /* ... */ });
    }

    // 10. Insert payments
    for (const payment of input.payments) {
      await tx.insert(billPayments).values({ billId: bill.id, /* ... */ });
    }

    // 11. Decrement stock (negative stock allowed)
    for (const line of lineItems) {
      await tx.insert(stockEntries).values({
        tenantId, productId: line.product.id, quantity: -line.quantity,
        type: 'sale', referenceType: 'bill', referenceId: bill.id,
        costPriceAtEntry: line.product.costPrice, createdBy: userId,
      });
    }

    // 12. Customer credit ledger entry (if credit payment)
    const creditPayment = input.payments.find(p => p.mode === 'credit');
    if (creditPayment) {
      await ledgerService.createEntry(tx, {
        tenantId, partyType: 'customer', partyId: input.customerId,
        entryType: 'sale', debit: creditPayment.amount, credit: 0,
        referenceType: 'bill', referenceId: bill.id,
      });
      // Atomic balance update
      await tx.execute(sql`
        UPDATE customers SET outstanding_balance = outstanding_balance + ${creditPayment.amount}
        WHERE id = ${input.customerId} AND tenant_id = ${tenantId}
      `);
    }

    // 13. Cash register entry (for cash payments)
    const cashPayment = input.payments.find(p => p.mode === 'cash');
    if (cashPayment) {
      await cashRegisterService.addEntry(tx, tenantId, userId, {
        type: 'cash_sale', amount: cashPayment.amount,
        referenceType: 'bill', referenceId: bill.id,
      });
    }

    // Stock is auto-updated by the database trigger on stock_entries insert.
    // No materialized view refresh needed.

    return bill;
  });
}
```

### 7.2 Bill Number Service

```typescript
// src/services/bill-number.service.ts
export async function next(tx: Transaction, tenantId: string, type: 'bill' | 'po' | 'return'): Promise<string> {
  const fy = getCurrentFinancialYear(tenantId); // e.g., "2025-2026"

  // Atomic increment with row-level lock
  const [row] = await tx.execute(sql`
    INSERT INTO bill_sequences (tenant_id, sequence_type, financial_year, last_number)
    VALUES (${tenantId}, ${type}, ${fy}, 1)
    ON CONFLICT (tenant_id, sequence_type, financial_year)
    DO UPDATE SET last_number = bill_sequences.last_number + 1
    RETURNING last_number
  `);

  const tenant = await getTenant(tx, tenantId);
  const prefix = tenant.invoicePrefix;
  const fyShort = fy.split('-')[0]; // "2025"
  const padded = String(row.lastNumber).padStart(5, '0');

  return `${prefix}-${fyShort}-${padded}`; // e.g., "KVB-2025-00042"
}
```

### 7.3 GST Calculator

```typescript
// src/lib/gst-calculator.ts
import Decimal from 'decimal.js';

export function backCalculate(inclusivePrice: number, gstRate: number, scheme: 'regular' | 'composition') {
  if (scheme === 'composition') {
    return { taxableValue: inclusivePrice, cgst: 0, sgst: 0, totalGst: 0 };
  }

  const price = new Decimal(inclusivePrice);
  const rate = new Decimal(gstRate);
  const taxableValue = price.div(rate.div(100).plus(1)).toDecimalPlaces(2);
  const totalGst = price.minus(taxableValue).toDecimalPlaces(2);
  const cgst = totalGst.div(2).toDecimalPlaces(2);
  const sgst = totalGst.minus(cgst).toDecimalPlaces(2); // absorb rounding difference

  return {
    taxableValue: taxableValue.toNumber(),
    cgst: cgst.toNumber(),
    sgst: sgst.toNumber(),
    totalGst: totalGst.toNumber(),
  };
}
```

### 7.4 Average Cost Recalculation

```typescript
// src/services/purchase.service.ts (within createPurchase transaction)
import Decimal from 'decimal.js';

for (const item of input.items) {
  const product = await getProduct(tx, tenantId, item.productId);
  const currentStock = product.currentStock; // trigger-maintained column

  let newAvgCost: number;
  if (currentStock <= 0) {
    // Guard: zero or negative stock — new purchase becomes entire cost basis
    newAvgCost = item.costPrice;
  } else {
    const oldTotal = new Decimal(product.costPrice).times(currentStock);
    const newTotal = new Decimal(item.costPrice).times(item.quantity);
    newAvgCost = oldTotal.plus(newTotal)
      .div(currentStock + item.quantity)
      .toDecimalPlaces(2)
      .toNumber();
  }

  await tx.update(products)
    .set({ costPrice: newAvgCost })
    .where(and(eq(products.id, item.productId), eq(products.tenantId, tenantId)));
}
```

### 7.5 Monetary Math Rule — decimal.js Everywhere

**JavaScript `number` type (IEEE 754 floats) must NEVER be used for monetary arithmetic.** All financial calculations in the service layer use `decimal.js`:

```typescript
// src/lib/money.ts
import Decimal from 'decimal.js';

// Configure: 2 decimal places, round half-up (standard financial rounding)
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/** Sum an array using decimal.js — replaces Array.reduce with native floats */
export function decimalSum<T>(items: T[], fn: (item: T) => Decimal): Decimal {
  return items.reduce((acc, item) => acc.plus(fn(item)), new Decimal(0)).toDecimalPlaces(2);
}

/** Convert Decimal to number for DB insertion (PostgreSQL DECIMAL handles precision) */
export function toDbDecimal(d: Decimal): number {
  return d.toDecimalPlaces(2).toNumber();
}
```

**Where this applies:**
- GST back-calculation (taxable value, CGST, SGST)
- Bill subtotal, discount, net amount computation
- Average cost recalculation
- Ledger debit/credit and balance updates
- Refund amount computation for returns
- Any multiplication, division, or subtraction involving money

**Where native `number` is safe:**
- Quantities (always integers)
- Percentages as stored values (not used in multiplication without Decimal)
- Counters, pagination, timestamps

---

## 8. Background Jobs

### 8.1 Queue Setup

```typescript
// src/jobs/queues.ts
import { Queue } from 'bullmq';
import { redis } from '../config/redis';

export const importQueue = new Queue('bulk-import', { connection: redis });
export const reportQueue = new Queue('report-export', { connection: redis });
export const scheduledQueue = new Queue('scheduled', { connection: redis });

// Register cron jobs on startup
await scheduledQueue.upsertJobScheduler('recurring-expenses', { pattern: '0 0 * * *' }); // daily midnight
await scheduledQueue.upsertJobScheduler('low-stock-check',    { pattern: '0 * * * *' }); // hourly
await scheduledQueue.upsertJobScheduler('payment-reminders',  { pattern: '0 9 * * *' }); // daily 9 AM
await scheduledQueue.upsertJobScheduler('aging-digest',       { pattern: '0 8 * * 1' }); // Monday 8 AM
await scheduledQueue.upsertJobScheduler('held-bills-cleanup', { pattern: '0 0 * * *' }); // daily midnight
await scheduledQueue.upsertJobScheduler('audit-partition',    { pattern: '0 0 25 * *' }); // 25th of each month
```

### 8.2 Worker

```typescript
// src/jobs/worker.ts
import { Worker } from 'bullmq';

const worker = new Worker('scheduled', async (job) => {
  switch (job.name) {
    case 'recurring-expenses': return await recurringExpenseJob();
    case 'low-stock-check':    return await lowStockCheckJob();
    case 'payment-reminders':  return await paymentRemindersJob();
    case 'aging-digest':       return await agingDigestJob();
    case 'held-bills-cleanup': return await heldBillsCleanupJob();
    case 'audit-partition':    return await auditPartitionJob();
  }
}, { connection: redis, concurrency: 5 });
```

---

## 9. File Storage

### 9.1 Presigned Upload Flow

```typescript
// src/routes/uploads.routes.ts
app.post('/uploads/presign', requireRole('owner', 'manager'), async (c) => {
  const { tenantId } = c.get('tenant');
  const { fileName, contentType, purpose } = await c.req.json();

  // Validate content type
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(contentType)) throw new ValidationError('Unsupported file type');

  // Build scoped key
  const key = `${tenantId}/${purpose}/${crypto.randomUUID()}/${fileName}`;

  const presignedUrl = await s3.getSignedUrl(new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: key,
    ContentType: contentType,
  }), { expiresIn: 300 }); // 5 minutes

  return c.json({ url: presignedUrl, key });
});
```

---

## 10. Caching

### 10.1 Cache Helpers

```typescript
// src/lib/cache.ts
import { redis } from '../config/redis';

export async function cached<T>(key: string, ttlSeconds: number, fetch: () => Promise<T>): Promise<T> {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit);

  const data = await fetch();
  await redis.setex(key, ttlSeconds, JSON.stringify(data));
  return data;
}

export async function invalidate(...patterns: string[]) {
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  }
}
```

### 10.2 Usage Pattern

```typescript
// Product search for POS (5-min cache)
const results = await cached(
  `tenant:${tenantId}:product:search:${query}`,
  300,
  () => productService.search(tenantId, query)
);

// Invalidate on product change
await invalidate(`tenant:${tenantId}:product:*`);
```

---

## 11. Testing Strategy

### 11.1 Test Pyramid

| Layer             | Tool            | Scope                                    | Count Target |
| ----------------- | --------------- | ---------------------------------------- | ------------ |
| **Unit**          | Vitest          | Pure functions: GST calculator, formatters, validators, bill number logic | 60% of tests |
| **Integration**   | Vitest + Testcontainers | Service layer against real PostgreSQL + Redis. Test full billing flow, purchase flow, ledger operations | 35% of tests |
| **E2E (API)**     | Vitest + Supertest | Full HTTP request → response. Auth flow, RBAC checks, error codes | 5% of tests |

### 11.2 Integration Test Example

```typescript
// tests/integration/billing.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

describe('Billing Service', () => {
  let db: DrizzleClient;

  beforeAll(async () => {
    const pgContainer = await new PostgreSqlContainer().start();
    db = createDrizzleClient(pgContainer.getConnectionUri());
    await runMigrations(db);
    await seedTestData(db);
  });

  it('creates a bill with split payment and updates stock', async () => {
    const bill = await billingService.createBill(testTenantId, testUserId, 'owner', {
      items: [{ productId: vestId, quantity: 2 }],
      payments: [
        { mode: 'cash', amount: 500 },
        { mode: 'upi', amount: 200 },
      ],
      customerId: null,
      additionalDiscountAmount: 0,
    });

    expect(bill.netAmount).toBe(700);
    expect(bill.status).toBe('completed');

    // Verify stock decremented
    const stock = await stockService.getCurrentStock(testTenantId, vestId);
    expect(stock).toBe(initialStock - 2);
  });

  it('rejects salesperson discount beyond limit', async () => {
    await expect(
      billingService.createBill(testTenantId, salespersonId, 'salesperson', {
        items: [{ productId: vestId, quantity: 1 }],
        payments: [{ mode: 'cash', amount: 100 }],
        customerId: null,
        additionalDiscountAmount: 9999, // exceeds limit
      })
    ).rejects.toThrow('DISCOUNT_LIMIT_EXCEEDED');
  });
});
```

### 11.3 What Must Be Tested

Critical paths that **must** have integration tests before Phase 1 launch:

- Bill creation (all payment modes, split payments, credit)
- Bill number sequence (concurrent calls produce gap-free sequence)
- Stock decrement (including negative stock scenario)
- Purchase recording + average cost recalculation (including zero-stock guard)
- Customer khata: credit sale → ledger entry → outstanding balance update
- Supplier payment: payment → ledger entry → outstanding balance update
- RBAC: salesperson cannot access cost prices, settings, or exceed discount limits
- Tenant isolation: user from tenant A cannot see tenant B's data

---

## 12. Database Migrations & Seeding

### 12.1 Migrations

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply pending migrations
npx drizzle-kit migrate

# View migration status
npx drizzle-kit status
```

Migration files are stored in `src/db/migrations/`, committed to git, and applied in CI/CD before deployment.

### 12.2 Default Seed Data

On tenant creation, the system seeds:

```typescript
// src/db/seed/defaults.ts
export const defaultCategories = [
  { name: "Men's Vests", code: 'MVT' },
  { name: "Men's Underwear", code: 'MUW' },
  { name: 'Socks', code: 'SOC' },
  { name: 'Jeans', code: 'JNS' },
  { name: 'Shirts', code: 'SHR' },
  { name: 'Kids Wear', code: 'KDW' },
  { name: 'Ethnic Wear (Men)', code: 'ETM' },
  { name: 'Blazers & Suits', code: 'BLZ' },
  { name: 'Ladies Suits', code: 'LST' },
  { name: 'Girls Wear', code: 'GRW' },
  { name: 'Unstitched Fabric', code: 'USF' },
  { name: 'Sarees', code: 'SAR' },
  { name: 'Lehengas', code: 'LHG' },
  { name: 'Bags', code: 'BAG' },
  { name: 'Deodorants', code: 'DEO' },
  { name: 'Other', code: 'OTH' },
];

export const defaultSizeSystems = [
  { name: 'Letter (XS-XXL)', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] },
  { name: 'Jeans (28-42)', values: ['28', '30', '32', '34', '36', '38', '40', '42'] },
  { name: 'Shirts (36-46)', values: ['36', '38', '40', '42', '44', '46'] },
  { name: 'Kids Number (0-14)', values: ['0', '2', '4', '6', '8', '10', '11', '12', '14'] },
  { name: 'Kids Age', values: ['1-2Y', '2-3Y', '3-4Y', '4-5Y', '5-6Y', '6-7Y', '8-10Y', '10-12Y'] },
  { name: 'Free Size', values: ['Free Size'] },
];

export const defaultExpenseCategories = [
  'Rent', 'Electricity', 'Salary', 'Transport', 'Packaging', 'Repairs', 'Miscellaneous',
];
```

---

## 13. Deployment & Infrastructure

### 13.1 Docker Compose (Local Development)

```yaml
# docker-compose.yml
services:
  api:
    build: ./apps/api
    ports: ['3000:3000']
    env_file: .env
    depends_on: [postgres, redis, minio]
    volumes:
      - ./apps/api/src:/app/src  # hot reload

  worker:
    build: ./apps/api
    command: tsx src/jobs/worker.ts
    env_file: .env
    depends_on: [postgres, redis]

  postgres:
    image: postgres:16-alpine
    ports: ['5432:5432']
    environment:
      POSTGRES_DB: inventrack
      POSTGRES_USER: inventrack
      POSTGRES_PASSWORD: localdev
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports: ['9000:9000', '9001:9001']
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin

volumes:
  pgdata:
```

### 13.2 Production Deployment

| Component        | Recommended                                     | Notes                                    |
| ---------------- | ----------------------------------------------- | ---------------------------------------- |
| **API Server**   | Docker container on AWS ECS / Railway / Render  | Stateless, auto-scaling                  |
| **Worker**       | Separate container, same image, different command | Scales independently of API              |
| **PostgreSQL**   | AWS RDS / Neon / Supabase                       | Managed, automated backups, WAL archiving |
| **Redis**        | AWS ElastiCache / Upstash                       | Managed, persistent                      |
| **File Storage** | AWS S3                                          | Presigned URLs, lifecycle policies       |
| **Domain + SSL** | Cloudflare                                      | CDN, SSL, DDoS protection               |

### 13.3 Environment Variables

```bash
# .env.example
NODE_ENV=development
PORT=3000
API_BASE_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://inventrack:localdev@localhost:5432/inventrack

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key-min-32-chars
JWT_ACCESS_TTL=900        # 15 minutes in seconds
JWT_REFRESH_TTL=604800    # 7 days in seconds

# S3
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=inventrack
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=us-east-1

# Email (optional in dev)
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

---

## 14. Monitoring & Observability

### 14.1 Structured Logging

All logs are JSON-formatted for machine parsing:

```typescript
// src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level(label) { return { level: label }; },
  },
  serializers: {
    req: pino.stdSerializers.req,
    err: pino.stdSerializers.err,
  },
});

// Usage:
logger.info({ tenantId, billId, amount }, 'Bill created');
logger.error({ err, tenantId, productId }, 'Stock update failed');
```

### 14.2 Health Check

```typescript
// GET /health
app.get('/health', async (c) => {
  const dbOk = await checkDb();
  const redisOk = await checkRedis();
  const status = dbOk && redisOk ? 200 : 503;

  return c.json({ status: dbOk && redisOk ? 'healthy' : 'degraded', db: dbOk, redis: redisOk }, status);
});
```

### 14.3 Key Metrics to Track

| Metric                            | Why                                         |
| --------------------------------- | ------------------------------------------- |
| `api_request_duration_ms`         | Detect slow endpoints, especially POS       |
| `api_request_count` by route      | Traffic patterns, capacity planning         |
| `db_query_duration_ms`            | Detect slow queries before they affect POS  |
| `bill_creation_count`             | Business metric — daily sales velocity      |
| `stock_negative_count`            | How often stock goes negative (discrepancy) |
| `sync_conflict_count`             | Offline sync health                         |
| `background_job_duration_ms`      | Job health, detect stuck jobs               |
| `cache_hit_ratio`                 | Cache effectiveness                         |

---

## 15. Security Hardening

| Concern                | Implementation                                                   |
| ---------------------- | ---------------------------------------------------------------- |
| **SQL Injection**      | Drizzle ORM uses parameterized queries. All `sql` template literals are auto-parameterized. No string concatenation in queries |
| **XSS**               | Backend returns JSON only (no HTML rendering). Frontend responsibility for output encoding |
| **CORS**              | Whitelist frontend origin(s) only. No `*` in production           |
| **CSRF**              | Refresh token in HTTP-only, Secure, SameSite=Strict cookie. Access token in Authorization header (not cookie) |
| **Password Storage**  | bcrypt with cost factor 12. Never log passwords or tokens         |
| **Rate Limiting**     | Redis sliding window. Per-IP for login, per-tenant for API (see Backend BRD Section 18) |
| **Input Validation**  | Zod schemas on every POST/PUT/PATCH. Reject unexpected fields    |
| **File Upload**       | Presigned URLs — files never pass through API server. Content-type validation server-side. Max size enforced by S3 policy |
| **Tenant Isolation**  | `tenant_id` in every query. No cross-tenant data leakage possible without bypassing the ORM layer |
| **Secrets**           | Environment variables only. Never committed to git. `.env` in `.gitignore` |
| **Dependencies**      | `npm audit` in CI. Dependabot / Renovate for automated updates   |
| **HTTPS**             | Enforced in production. HSTS headers                             |

---

## 16. Performance Optimizations

### 16.1 POS-Critical Path (< 500ms target)

The POS product search (`GET /products/search?q=rupa`) is the most latency-sensitive endpoint. Optimizations:

1. **PostgreSQL trigram index** on `products.name` for fuzzy matching
2. **Redis cache** (1-min TTL) keyed by `tenant:search:{query}`
3. **Select only POS-relevant columns**: id, name, sku, barcode, sellingPrice, catalogDiscountPct, gstRate, size, currentStock
4. **Limit results** to 20 items
5. **Barcode lookup**: exact match on unique index — single-row fetch, no search needed

### 16.2 N+1 Prevention

- Use JOINs in Drizzle for related data (bill + bill_items + bill_payments in one query)
- For list endpoints: batch-fetch related data with `WHERE id IN (...)` instead of per-row queries

### 16.3 Connection Pooling

```typescript
// src/config/database.ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,              // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

### 16.4 Dashboard Query Optimization

The dashboard endpoint (`GET /dashboard`) aggregates multiple queries. Strategy:

1. **Parallel execution**: run all dashboard queries concurrently with `Promise.all()`
2. **Redis cache**: 30-second TTL on the full dashboard payload
3. **Materialized view**: `product_stock` view avoids SUM aggregation on every stock query
4. **Future**: if dashboard queries exceed 2 seconds under load, introduce a read replica

---

## 17. Development Workflow

### 17.1 Local Setup

```bash
# Clone and install
git clone <repo> && cd inventrack
npm install

# Start infrastructure
docker compose up -d postgres redis minio

# Run migrations
cd apps/api && npx drizzle-kit migrate

# Start API (with hot reload)
npm run dev

# Start worker (separate terminal)
npm run dev:worker

# Run tests
npm test
```

### 17.2 CI Pipeline (GitHub Actions)

```
On Pull Request:
  ├── Lint (ESLint)
  ├── Type Check (tsc --noEmit)
  ├── Unit Tests (Vitest)
  └── Integration Tests (Vitest + Testcontainers)

On Merge to main:
  ├── All of above
  ├── Build Docker image
  ├── Run migrations on staging DB
  └── Deploy to staging
```

### 17.3 Branch Strategy

- `main` — production-ready, auto-deploys to staging
- `feature/*` — feature branches, PR into main
- `hotfix/*` — urgent fixes, PR into main with expedited review

### 17.4 Code Review Checklist

Every PR involving tenant-scoped data must confirm:
- [ ] All queries include `WHERE tenant_id = ?`
- [ ] New endpoints have RBAC middleware
- [ ] Input validation via Zod schema
- [ ] Sensitive fields (cost_price) filtered by role
- [ ] Write operations wrapped in transactions where atomicity is needed
- [ ] Integration test covers the happy path + key error cases

---

*End of Document*

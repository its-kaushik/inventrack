# API Documentation — InvenTrack

**Base URL:** `https://inventrack-production-2fa7.up.railway.app/api/v1`

**Version:** 1.0 (Phase 1)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [Auth Endpoints](#3-auth-endpoints)
4. [Setup & Settings](#4-setup--settings)
5. [Users](#5-users)
6. [Categories, Sub-Types, Size Systems & Brands](#6-categories-sub-types-size-systems--brands)
7. [Products](#7-products)
8. [Stock](#8-stock)
9. [Labels](#9-labels)
10. [Bills (POS)](#10-bills-pos)
11. [Purchases](#11-purchases)
12. [Suppliers](#12-suppliers)
13. [Customers](#13-customers)
14. [Cash Register](#14-cash-register)
15. [Dashboard](#15-dashboard)
16. [Uploads](#16-uploads)
17. [Error Codes](#17-error-codes)

---

## 1. Overview

### Response Envelope

Every response follows this format:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": { "cursor": "next_page_token", "has_more": true },
  "error": null
}
```

**Error:**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "details": [ { "path": "field", "message": "..." } ]
  }
}
```

### Pagination

List endpoints use offset-based pagination:
- `?limit=20` — items per page (max 100, default 20)
- `?offset=0` — skip N items

Response includes `meta.has_more` to indicate if there are more items.

### Content Type

All request bodies must be `Content-Type: application/json`.

---

## 2. Authentication

### How It Works

1. **Login** with phone + password → receive `accessToken` in response body + `refreshToken` as HTTP-only cookie
2. **Use** the access token on all protected endpoints: `Authorization: Bearer <accessToken>`
3. **Refresh** when access token expires (15 min) by calling `POST /auth/refresh` — cookie is sent automatically
4. **Logout** clears the refresh token

### Token Details

| Token | Lifetime | Storage | Sent As |
|-------|----------|---------|---------|
| Access Token | 15 minutes | Frontend memory (Zustand) | `Authorization: Bearer <token>` header |
| Refresh Token | 7 days | HTTP-only cookie | Automatically via cookie |

### Roles

| Role | Access Level |
|------|-------------|
| `owner` | Full access — settings, users, products, billing, reports, everything |
| `manager` | Products, purchases, billing, suppliers, customers — no user management or settings |
| `salesperson` | POS billing, view products (no cost price), create customers — limited access |

---

## 3. Auth Endpoints

### `POST /auth/login`

Login with phone number and password.

**Auth:** None (public)

**Rate Limit:** 5 requests per minute per IP

**Request Body:**
```json
{
  "phone": "9876543210",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "user": {
      "id": "uuid",
      "tenantId": "uuid",
      "name": "Kaushik",
      "phone": "9876543210",
      "email": null,
      "role": "owner",
      "setupComplete": true
    }
  }
}
```

**Also sets:** `Set-Cookie: refreshToken=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`

---

### `POST /auth/refresh`

Rotate refresh token and get a new access token.

**Auth:** None (uses refresh token cookie)

**Request Body:** None (cookie sent automatically)

**Response (200):**
```json
{
  "success": true,
  "data": { "accessToken": "eyJhbGciOiJIUzI1NiJ9..." }
}
```

---

### `POST /auth/logout`

Invalidate refresh token and clear cookie.

**Auth:** None

**Response (200):**
```json
{
  "success": true,
  "data": { "message": "Logged out" }
}
```

---

### `POST /auth/forgot-password`

Request password reset. (Phase 1: placeholder — no email sent)

**Auth:** None

**Request Body:**
```json
{ "phone": "9876543210" }
```

---

### `POST /auth/reset-password`

Reset password with token. (Phase 1: placeholder)

**Auth:** None

**Request Body:**
```json
{ "token": "reset-token", "newPassword": "newpass123" }
```

---

### `GET /auth/me`

Get current authenticated user details with tenant info.

**Auth:** Required (any role)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "name": "Kaushik",
    "phone": "9876543210",
    "email": null,
    "role": "owner",
    "tenant": {
      "id": "uuid",
      "name": "Kaushik Vastra Bhandar",
      "gstScheme": "regular",
      "gstin": "09ABCDE1234F1Z5",
      "invoicePrefix": "KVB",
      "settings": {
        "low_stock_default_threshold": 10,
        "aging_threshold_days": 90,
        "return_window_days": 15,
        "max_salesperson_discount_amount": 500,
        "max_salesperson_discount_percent": 10,
        "receipt_footer_text": "Thank you for shopping!",
        "receipt_header_text": "",
        "label_template_id": "default"
      },
      "setupComplete": true
    }
  }
}
```

---

## 4. Setup & Settings

### `POST /setup/tenant`

Create a new store (tenant) with the owner account. Seeds 16 default categories and 6 size systems.

**Auth:** None (public)

**Request Body:**
```json
{
  "storeName": "Kaushik Vastra Bhandar",
  "ownerName": "Mayank Kaushik",
  "phone": "9876543210",
  "password": "securepass123",
  "email": "kaushik@example.com",
  "address": "Main Market, City Center",
  "gstin": "09ABCDE1234F1Z5",
  "gstScheme": "regular"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| storeName | string | Yes | |
| ownerName | string | Yes | |
| phone | string | Yes | Min 10 characters |
| password | string | Yes | Min 6 characters |
| email | string | No | Must be valid email |
| address | string | No | |
| gstin | string | No | Max 15 characters |
| gstScheme | string | No | `"regular"` (default) or `"composition"` |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "tenant": { "id": "uuid", "name": "Kaushik Vastra Bhandar", "gstScheme": "regular" },
    "owner": { "id": "uuid", "tenantId": "uuid", "name": "Mayank Kaushik", "phone": "9876543210", "email": null, "role": "owner" }
  }
}
```

---

### `PUT /setup/wizard`

Mark the setup wizard as complete.

**Auth:** Required (owner only)

**Request Body:** None

**Response (200):**
```json
{ "success": true, "data": { "setupComplete": true } }
```

---

### `GET /settings`

Get tenant settings.

**Auth:** Required (owner only)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "settings": { "low_stock_default_threshold": 10, "aging_threshold_days": 90, ... },
    "gstScheme": "regular",
    "setupComplete": true
  }
}
```

---

### `PATCH /settings`

Update tenant settings (merges with existing).

**Auth:** Required (owner only)

**Request Body:**
```json
{ "low_stock_default_threshold": 5, "max_salesperson_discount_amount": 1000 }
```

---

### `GET /settings/store`

Get store profile details.

**Auth:** Required (owner only)

---

### `PATCH /settings/store`

Update store profile.

**Auth:** Required (owner only)

**Request Body:**
```json
{
  "name": "New Store Name",
  "gstin": "09ABCDE1234F1Z5",
  "gstScheme": "composition",
  "invoicePrefix": "KVB",
  "financialYearStart": 4
}
```

---

## 5. Users

**All endpoints require:** Auth + owner role

### `GET /users`

List all users in the tenant.

### `POST /users`

Create a new user.

**Request Body:**
```json
{
  "name": "Suresh",
  "phone": "9876543212",
  "email": "suresh@example.com",
  "role": "salesperson",
  "password": "pass123456"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| name | string | Yes | |
| phone | string | Yes | Min 10 chars. Unique per tenant |
| email | string | No | Valid email |
| role | string | Yes | `"owner"`, `"manager"`, or `"salesperson"` |
| password | string | Yes | Min 6 characters |

### `GET /users/:id`

Get a single user by ID.

### `PATCH /users/:id`

Update user fields (name, phone, email, role, isActive).

### `POST /users/:id/reset-password`

Reset a user's password.

**Request Body:**
```json
{ "newPassword": "newpass123" }
```

---

## 6. Categories, Sub-Types, Size Systems & Brands

**Auth:** Required. Read = any role. Write = owner/manager.

### Categories

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/categories` | any | List all categories (ordered by sortOrder) |
| POST | `/categories` | owner/manager | Create category |
| PATCH | `/categories/:id` | owner/manager | Update category |
| DELETE | `/categories/:id` | owner | Deactivate category (soft-delete) |

**Create/Update Body:**
```json
{ "name": "Men's Vests", "code": "MVT", "sortOrder": 1 }
```

### Sub-Types

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/categories/:id/sub-types` | any | List sub-types for a category |
| POST | `/sub-types` | owner/manager | Create sub-type |
| PATCH | `/sub-types/:id` | owner/manager | Update sub-type |

**Create Body:**
```json
{ "categoryId": "uuid", "name": "RN", "code": "RN" }
```

### Size Systems

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/size-systems` | any | List all size systems |
| POST | `/size-systems` | owner/manager | Create size system |
| PATCH | `/size-systems/:id` | owner/manager | Update size system |

**Create Body:**
```json
{ "name": "Letter (XS-XXL)", "values": ["XS", "S", "M", "L", "XL", "XXL"] }
```

### Brands

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/brands` | any | List all brands |
| POST | `/brands` | owner/manager | Create brand |
| PATCH | `/brands/:id` | owner/manager | Update brand |

**Create Body:**
```json
{ "name": "Rupa", "code": "RPA" }
```

---

## 7. Products

**Auth:** Required. Read = any role. Write = owner/manager. Delete = owner only.

**Important:** Salesperson does NOT see `costPrice` in any response.

### `GET /products`

List products with filters and pagination.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| category_id | uuid | — | Filter by category |
| brand_id | uuid | — | Filter by brand |
| search | string | — | Search by name (ILIKE) |
| updated_after | ISO date | — | Only products updated after this timestamp (for incremental catalog sync) |
| is_active | boolean | true | Set to `false` to include archived products |
| limit | number | 20 | Max 100 |
| offset | number | 0 | |

---

### `GET /products/search`

Fast POS search — exact match on barcode/SKU, then fuzzy name search.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| q | string | Search query (barcode, SKU, or product name) |

**Response:** Array of matching products (max 20). Exact barcode/SKU matches returned first.

---

### `GET /products/:id`

Get product details. Returns even archived (is_active=false) products — needed for bill lookups and returns.

---

### `POST /products`

Create a new product. Barcode defaults to SKU if not provided.

**Request Body:**
```json
{
  "name": "Rupa RN Vest - L",
  "sku": "MVT-RPA-RN-L-001",
  "barcode": "MVT-RPA-RN-L-001",
  "categoryId": "uuid",
  "subTypeId": "uuid",
  "brandId": "uuid",
  "size": "L",
  "color": "White",
  "hsnCode": "61089200",
  "gstRate": 5,
  "sellingPrice": 350,
  "costPrice": 200,
  "mrp": 400,
  "catalogDiscountPct": 15,
  "minStockLevel": 10,
  "description": "Men's RN vest, cotton",
  "imageUrls": ["s3-key-1", "s3-key-2"]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| name | string | Yes | |
| sku | string | Yes | Max 50. Unique per tenant |
| barcode | string | No | Max 50. Defaults to SKU. Unique per tenant |
| categoryId | uuid | Yes | |
| subTypeId | uuid | No | |
| brandId | uuid | No | |
| size | string | No | Max 20 |
| color | string | No | Max 50 |
| hsnCode | string | No | Max 8 |
| gstRate | number | No | 0-100. Default 5 |
| sellingPrice | number | Yes | Must be positive |
| costPrice | number | No | Default 0 |
| mrp | number | No | |
| catalogDiscountPct | number | No | 0-100. Default 0 |
| minStockLevel | number | No | Default 10 |
| reorderPoint | number | No | |
| description | string | No | |
| imageUrls | string[] | No | S3 keys from presigned uploads |

---

### `PUT /products/:id`

Update product. Same fields as create, all optional (at least 1 required).

### `DELETE /products/:id`

Soft-delete product (sets `is_active = false`). **Never hard-deletes.** Archived products are hidden from search/list but remain accessible by ID for billing history and returns.

**Auth:** Owner only

### `POST /products/:id/barcode`

Generate barcode PNG image for a product.

**Response:** `image/png` binary (Code-128 barcode)

### `POST /products/import`

Bulk product import. (Phase 1: stub — returns "coming soon")

---

## 8. Stock

**Auth:** Required (owner/manager only)

### `GET /stock`

Stock overview — all products with current stock level and status.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| category_id | uuid | Filter by category |
| status | string | `"healthy"`, `"low"`, or `"out"` |
| limit | number | Default 20 |
| offset | number | Default 0 |

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      { "id": "uuid", "name": "Rupa RN Vest - L", "sku": "MVT-RPA-RN-L-001", "currentStock": 15, "minStockLevel": 10, "status": "healthy" }
    ],
    "summary": { "total": 5, "inStock": 3, "low": 1, "out": 1 },
    "hasMore": false
  }
}
```

### `GET /stock/:productId`

Stock detail for a single product with status.

### `GET /stock/:productId/history`

Stock movement history (chronological entries showing each stock in/out).

---

## 9. Labels

**Auth:** Required (any role)

### `POST /labels/generate`

Generate barcode label data for printing.

**Request Body:**
```json
{
  "items": [
    { "productId": "uuid", "quantity": 50 },
    { "productId": "uuid", "quantity": 30 }
  ],
  "templateId": "default"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "labels": [
      {
        "productName": "Rupa RN Vest - L",
        "sku": "MVT-RPA-RN-L-001",
        "barcode": "MVT-RPA-RN-L-001",
        "size": "L",
        "sellingPrice": "350.00",
        "quantity": 50,
        "barcodeDataUrl": "data:image/png;base64,iVBORw0KGgo..."
      }
    ],
    "templateId": "default"
  }
}
```

### `GET /labels/templates`

List available label templates.

---

## 10. Bills (POS)

**Auth:** Required (any role for creating bills)

### `POST /bills`

**Create a bill — the core POS operation.** This is an atomic transaction that:
1. Validates discount limits (salesperson max discount enforced)
2. Computes line items with catalog discount and GST
3. Validates payment amounts balance the total
4. Generates a gap-free bill number (INV-2026-00001)
5. Creates bill + items + payments + stock entries + ledger entries atomically

**Request Body:**
```json
{
  "items": [
    { "productId": "uuid", "quantity": 2 },
    { "productId": "uuid", "quantity": 1 }
  ],
  "payments": [
    { "mode": "cash", "amount": 500 },
    { "mode": "upi", "amount": 250, "reference": "UPI-REF-123" }
  ],
  "customerId": "uuid",
  "additionalDiscountAmount": 50,
  "additionalDiscountPct": 0,
  "clientId": "uuid-for-offline-idempotency",
  "notes": "Customer asked for gift wrapping"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| items | array | Yes | Min 1 item. Each: `{ productId: uuid, quantity: int > 0 }` |
| payments | array | Yes | Min 1 payment. Each: `{ mode, amount, reference? }` |
| payments[].mode | string | Yes | `"cash"`, `"upi"`, `"card"`, or `"credit"` |
| payments[].amount | number | Yes | Must be positive |
| customerId | uuid | Conditional | **Required if any payment mode is `"credit"`** |
| additionalDiscountAmount | number | No | Default 0. Bargain discount in ₹ |
| additionalDiscountPct | number | No | Default 0 (0-100) |
| clientId | uuid | No | For offline sync idempotency. Same clientId returns same bill |
| notes | string | No | |

**Business Rules:**
- `SUM(payments.amount)` must equal the calculated `netAmount` (after discounts)
- If `mode = "credit"`, `customerId` is mandatory
- Salesperson: `additionalDiscountAmount` cannot exceed `max_salesperson_discount_amount` from settings
- Negative stock is allowed (item sold even if stock = 0)
- Bill number is sequential and gap-free per tenant per financial year

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "billNumber": "KVB-2026-00001",
    "customerId": "uuid",
    "salespersonId": "uuid",
    "subtotal": "750.00",
    "catalogDiscountTotal": "112.50",
    "additionalDiscountAmount": "50.00",
    "taxAmount": "27.98",
    "netAmount": "587.50",
    "gstSchemeAtSale": "regular",
    "status": "completed",
    "createdAt": "2026-04-01T10:30:00.000Z"
  }
}
```

**Error Responses:**
- `VALIDATION_ERROR` (400) — invalid input or payment doesn't balance
- `FORBIDDEN` / `DISCOUNT_LIMIT_EXCEEDED` (403) — salesperson exceeds discount limit
- `NOT_FOUND` (404) — product not found

---

### `GET /bills`

List bills with filters.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| customer_id | uuid | Filter by customer |
| salesperson_id | uuid | Filter by salesperson |
| status | string | `"completed"`, `"voided"`, etc. |
| limit | number | Default 20 |
| offset | number | Default 0 |

---

### `GET /bills/:id`

Get bill detail with all line items and payments.

**Response includes:** `items` array (with product snapshots, discounts, GST) + `payments` array.

---

### `GET /bills/:id/print`

Get print-ready bill data, adapted for the GST scheme at time of sale.

**Response:**
```json
{
  "success": true,
  "data": {
    "type": "tax_invoice",
    "declaration": null,
    "tenant": { "name": "Kaushik Vastra Bhandar", "address": "...", "gstin": "...", "phone": "..." },
    "bill": { "...full bill with items and payments..." }
  }
}
```

**For Composition Scheme:**
```json
{
  "type": "bill_of_supply",
  "declaration": "Composition taxable person, not eligible to collect tax on supplies",
  "tenant": { ... },
  "bill": { ... }
}
```

---

## 11. Purchases

**Auth:** Required (owner/manager only)

### `POST /purchases`

Record a goods receipt (purchase from supplier). Atomically:
- Creates purchase + items
- Increases stock (via trigger)
- Recalculates average cost (with zero-stock guard)
- Creates supplier ledger entry
- Updates supplier outstanding balance

**Request Body:**
```json
{
  "supplierId": "uuid",
  "invoiceNumber": "INV-2024-001",
  "invoiceDate": "2026-04-01",
  "invoiceImageUrl": "s3-key-from-presigned-upload",
  "totalAmount": 5000,
  "cgstAmount": 125,
  "sgstAmount": 125,
  "igstAmount": 0,
  "isRcm": false,
  "items": [
    { "productId": "uuid", "quantity": 10, "costPrice": 200, "gstRate": 5, "gstAmount": 100 },
    { "productId": "uuid", "quantity": 5, "costPrice": 700, "gstRate": 12, "gstAmount": 150 }
  ]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| supplierId | uuid | Yes | |
| invoiceNumber | string | No | Supplier's invoice number |
| invoiceDate | string | No | YYYY-MM-DD |
| invoiceImageUrl | string | No | S3 key from presigned upload |
| totalAmount | number | Yes | Must be positive |
| cgstAmount | number | No | For ITC tracking (Regular GST) |
| sgstAmount | number | No | For ITC tracking |
| igstAmount | number | No | For inter-state purchases |
| isRcm | boolean | No | Reverse charge mechanism |
| items | array | Yes | Min 1. Each: `{ productId, quantity, costPrice, gstRate?, gstAmount? }` |

### `GET /purchases`

List purchases. Filter by `supplier_id`.

### `GET /purchases/:id`

Purchase detail with all items.

---

## 12. Suppliers

**Auth:** Required (owner/manager only)

### `GET /suppliers`

List suppliers. Optional `search` query param for name search.

### `POST /suppliers`

**Request Body:**
```json
{
  "name": "Rupa & Company Ltd",
  "contactPerson": "Vikram Shah",
  "phone": "9111111111",
  "email": "vikram@rupa.com",
  "address": "Industrial Area, Kolkata",
  "gstin": "24ABCDE5678F1Z5",
  "paymentTerms": "Net 30",
  "notes": "Primary vest supplier"
}
```

### `GET /suppliers/:id`

Supplier detail with outstanding balance.

### `PUT /suppliers/:id`

Update supplier. Same fields as create, all optional.

### `GET /suppliers/:id/ledger`

Supplier ledger with **running balance** (computed via SQL window function).

**Query Parameters:** `limit` (default 50), `offset` (default 0)

**Response includes:** Each entry has `running_balance` showing cumulative balance at that point.

### `POST /suppliers/:id/payments`

Record payment to supplier. Decreases outstanding balance.

**Request Body:**
```json
{
  "amount": 5000,
  "paymentMode": "bank_transfer",
  "paymentReference": "NEFT-REF-12345",
  "description": "Partial payment for March purchase"
}
```

| Field | Type | Required | Options |
|-------|------|----------|---------|
| amount | number | Yes | Must be positive |
| paymentMode | string | Yes | `"cash"`, `"upi"`, `"bank_transfer"`, `"cheque"`, `"card"` |
| paymentReference | string | No | Cheque no, NEFT ref, UPI ref |
| description | string | No | |

### `GET /suppliers/:id/products`

List distinct products supplied by this supplier (from purchase history).

---

## 13. Customers

**Auth:** Required. All roles can read/create. Payments = any auth.

### `GET /customers/search`

Quick phone search for POS customer lookup.

**Query Parameters:** `phone` (string)

### `GET /customers`

List customers with filters.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| search | string | Search by name |
| with_balance | boolean | Only customers with outstanding balance > 0 |
| limit | number | Default 50 |
| offset | number | Default 0 |

### `POST /customers`

Create customer. Minimum: name + phone.

**Request Body:**
```json
{
  "name": "Rahul Sharma",
  "phone": "8888888888",
  "email": "rahul@example.com",
  "address": "MG Road, City"
}
```

### `GET /customers/:id`

Customer detail with outstanding balance.

### `PUT /customers/:id`

Update customer.

### `GET /customers/:id/ledger`

Customer khata ledger with **running balance** (SQL window function).

**Query Parameters:** `limit` (default 50), `offset` (default 0)

### `POST /customers/:id/payments`

Record payment from customer. Decreases outstanding balance.

**Request Body:**
```json
{
  "amount": 500,
  "paymentMode": "cash",
  "paymentReference": "",
  "description": "Partial khata payment"
}
```

| Field | Type | Required | Options |
|-------|------|----------|---------|
| amount | number | Yes | Must be positive |
| paymentMode | string | Yes | `"cash"`, `"upi"`, `"bank_transfer"`, `"cheque"`, `"card"` |
| paymentReference | string | No | |
| description | string | No | |

---

## 14. Cash Register

**Auth:** Required (any role)

### `POST /cash-register/open`

Open a cash register for the day. One open register per user at a time.

**Request Body:**
```json
{ "openingBalance": 5000 }
```

### `GET /cash-register/current`

Get the currently open register for the logged-in user. Returns `null` if no register is open.

**Response includes:** `entries` array (all cash movements) + `currentBalance` (opening + entries).

### `GET /cash-register/:id`

Get register detail with all entries.

### `POST /cash-register/:id/close`

Close the register. Enter the actual counted cash to calculate discrepancy.

**Request Body:**
```json
{ "actualClosing": 15650 }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "openingBalance": "5000.00",
    "calculatedClosing": "15650.00",
    "actualClosing": "15650.00",
    "discrepancy": "0.00",
    "status": "closed"
  }
}
```

### `GET /cash-register/history`

Past register sessions for the current user.

---

## 15. Dashboard

**Auth:** Required (any role)

### `GET /dashboard`

Returns role-dependent aggregated data. Cached in Redis for 30 seconds.

**Owner/Manager Response:**
```json
{
  "success": true,
  "data": {
    "todaySales": { "total": 24500, "count": 12, "yesterdayTotal": 21800 },
    "outstandingReceivables": 145000,
    "outstandingPayables": 89000,
    "lowStockCount": 5,
    "recentBills": [ { "id": "...", "billNumber": "KVB-2026-00042", "netAmount": "750.00", "createdAt": "..." } ],
    "paymentModeSplit": { "cash": 12000, "upi": 8500, "card": 4000 }
  }
}
```

**Salesperson Response:**
```json
{
  "success": true,
  "data": {
    "mySalesToday": { "total": 8500, "count": 5 },
    "recentMyBills": [ ... ]
  }
}
```

---

## 16. Uploads

**Auth:** Required (owner/manager only)

### `POST /uploads/presign`

Get a presigned S3 URL for direct file upload. The frontend uploads directly to S3 using this URL.

**Request Body:**
```json
{
  "fileName": "invoice-march.pdf",
  "contentType": "application/pdf",
  "purpose": "purchases"
}
```

**Allowed content types:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf`

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://s3-bucket.../presigned-url?...",
    "key": "tenant-id/purchases/uuid/invoice-march.pdf"
  }
}
```

**Upload flow:**
1. Call `POST /uploads/presign` → get `url` + `key`
2. `PUT` the file directly to the `url` with `Content-Type` header
3. Save the `key` when creating the entity (e.g., purchase `invoiceImageUrl`)

---

## 17. Error Codes

| Code | HTTP Status | When |
|------|-------------|------|
| `VALIDATION_ERROR` | 400 | Invalid input (missing fields, wrong format, unbalanced payments) |
| `UNAUTHORIZED` | 401 | Missing or expired token |
| `FORBIDDEN` | 403 | Role doesn't have permission |
| `DISCOUNT_LIMIT_EXCEEDED` | 403 | Salesperson exceeded max additional discount |
| `NOT_FOUND` | 404 | Entity not found or belongs to another tenant |
| `DUPLICATE_ENTRY` | 409 | SKU, barcode, or phone already exists in this tenant |
| `RATE_LIMITED` | 429 | Too many requests |
| `TENANT_SUSPENDED` | 403 | Tenant account has been suspended |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

*72 endpoints total across 15 route groups. Phase 1 complete.*

# API Documentation — InvenTrack

**Base URL:** `https://inventrack-production-2fa7.up.railway.app/api/v1`

**Version:** 1.0 (Phase 1-4)

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
17. [Purchase Orders](#17-purchase-orders)
18. [Purchase Returns](#18-purchase-returns)
19. [Expenses](#19-expenses)
20. [GST](#20-gst)
21. [Reports](#21-reports)
22. [Audit Log](#22-audit-log)
23. [Returns](#23-returns)
24. [Sync Conflicts](#24-sync-conflicts)
25. [Notifications](#25-notifications)
26. [Self-Service Signup](#26-self-service-signup)
27. [Super Admin](#27-super-admin)
28. [Error Codes](#28-error-codes)

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

### `POST /auth/send-otp`

Send a one-time password to a phone number for passwordless login.

**Auth:** None (public)

**Rate Limit:** 3 requests per 10 minutes per phone

**Request Body:**
```json
{ "phone": "9876543210" }
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| phone | string | Yes | Min 10 characters |

**Response (200):**
```json
{
  "success": true,
  "data": { "message": "OTP sent successfully" }
}
```

---

### `POST /auth/verify-otp`

Verify OTP and login. Returns the same response shape as `POST /auth/login`.

**Auth:** None (public)

**Rate Limit:** 3 requests per 10 minutes per phone

**Request Body:**
```json
{ "phone": "9876543210", "otp": "123456" }
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| phone | string | Yes | Min 10 characters |
| otp | string | Yes | Exactly 6 characters |

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

### `POST /settings/export-data`

Queue a full data export job. Generates CSVs for 8 entities (products, bills, purchases, customers, suppliers, expenses, stock, ledger), bundles them into a ZIP, and uploads to S3. The user is notified when the export is ready.

**Auth:** Required (owner/manager)

**Request Body:** None

**Response (202):**
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "message": "Data export started. You will be notified when ready."
  }
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

### `POST /stock/adjust`

Adjust stock with a reason code. Used for damage write-offs, theft, manual corrections, expired goods, etc.

**Auth:** Required (owner/manager)

**Request Body:**
```json
{
  "productId": "uuid",
  "quantityChange": -5,
  "reason": "damage",
  "notes": "Water-damaged items from warehouse leak"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| productId | uuid | Yes | |
| quantityChange | integer | Yes | Must be nonzero. Negative = decrease, positive = increase |
| reason | enum | Yes | `"damage"`, `"theft"`, `"count_correction"`, `"expired"`, `"other"` |
| notes | string | No | Free-text explanation |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "productId": "uuid",
    "quantityChange": -5,
    "reason": "damage",
    "notes": "Water-damaged items from warehouse leak",
    "createdAt": "2026-04-01T10:30:00.000Z"
  }
}
```

---

### `POST /stock/audit`

Submit a physical count (stock audit). Compares counted quantities against system stock and returns a variance report. The audit result is stored in Redis for 1 hour pending approval.

**Auth:** Required (owner/manager)

**Request Body:**
```json
{
  "items": [
    { "productId": "uuid", "countedQty": 48 },
    { "productId": "uuid", "countedQty": 12 }
  ]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| items | array | Yes | Min 1 item |
| items[].productId | uuid | Yes | |
| items[].countedQty | integer | Yes | Min 0. The physical count |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "auditId": "uuid",
    "variances": [
      { "productId": "uuid", "productName": "Rupa RN Vest - L", "systemQty": 50, "countedQty": 48, "variance": -2 },
      { "productId": "uuid", "productName": "Dollar Bigboss Trunk - M", "systemQty": 10, "countedQty": 12, "variance": 2 }
    ],
    "expiresAt": "2026-04-01T11:30:00.000Z"
  }
}
```

---

### `POST /stock/audit/approve`

Approve a pending audit and apply all non-zero variances as stock adjustments.

**Auth:** Required (owner/manager)

**Request Body:**
```json
{ "auditId": "uuid" }
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| auditId | uuid | Yes | Must be a valid pending audit from `/stock/audit` |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "auditId": "uuid",
    "adjustmentsApplied": 2,
    "message": "Audit approved. 2 stock adjustments applied."
  }
}
```

---

## 9. Labels

**Auth:** Required (any role)

### `POST /labels/generate`

Generate barcode label data for printing. Supports two output formats: `html` returns a printable label sheet, `json` returns structured data for custom frontend rendering.

**Request Body:**
```json
{
  "items": [
    { "productId": "uuid", "quantity": 50 },
    { "productId": "uuid", "quantity": 30 }
  ],
  "templateId": "default",
  "format": "html"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| items | array | Yes | Min 1 item |
| items[].productId | uuid | Yes | |
| items[].quantity | integer | Yes | Positive integer |
| templateId | string | No | Default: `"default"`. Options: `"default"`, `"thermal"`, `"minimal"`, or custom template ID |
| format | enum | No | `"html"` (default) or `"json"` |

**Response (format=json):**
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

**Response (format=html):** Returns `Content-Type: text/html` with a printable label sheet containing a print button and grid layout.

### `GET /labels/templates`

List available label templates (built-in defaults + custom templates).

---

### `POST /labels/templates`

Create a custom label template.

**Auth:** Required (owner/manager)

**Request Body:**
```json
{
  "name": "Large Labels",
  "description": "60mm x 40mm labels for shelf display",
  "fields": ["productName", "sku", "barcode", "size", "sellingPrice"],
  "layout": { "columns": 2, "labelWidth": "60mm", "labelHeight": "40mm" }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| name | string | Yes | Max 100 characters |
| description | string | No | Max 255 characters |
| fields | string[] | Yes | Min 1 field. Available: `productName`, `sku`, `barcode`, `size`, `sellingPrice`, `mrp`, `color` |
| layout | object | No | Custom layout configuration |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Large Labels",
    "description": "60mm x 40mm labels for shelf display",
    "fields": ["productName", "sku", "barcode", "size", "sellingPrice"],
    "layout": { "columns": 2, "labelWidth": "60mm", "labelHeight": "40mm" },
    "createdAt": "2026-04-01T10:30:00.000Z"
  }
}
```

---

### `PUT /labels/templates/:id`

Update an existing custom label template.

**Auth:** Required (owner/manager)

**Request Body:** Same fields as create, all optional (at least 1 required).

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

### `POST /bills/:id/void`

Void a completed bill. Reverses all stock movements, ledger entries, and cash register entries associated with the bill.

**Auth:** Required (owner only)

**Request Body:** None

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "billNumber": "KVB-2026-00001",
    "status": "voided",
    "voidedAt": "2026-04-01T14:00:00.000Z"
  }
}
```

---

### `POST /bills/sync`

Batch sync offline bills. Accepts an array of bills created offline and processes them server-side. Bills with duplicate `clientId` are deduplicated. Bills that cannot be processed (e.g., insufficient stock for credit validation) are returned as conflicts.

**Auth:** Required (any role)

**Request Body:**
```json
{
  "bills": [
    {
      "clientId": "uuid",
      "offlineCreatedAt": "2026-04-01T09:00:00.000Z",
      "items": [
        { "productId": "uuid", "quantity": 2 }
      ],
      "payments": [
        { "mode": "cash", "amount": 700 }
      ],
      "customerId": "uuid",
      "additionalDiscountAmount": 0,
      "notes": "Offline sale"
    }
  ]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| bills | array | Yes | Min 1 bill |
| bills[].clientId | uuid | Yes | Unique offline ID for idempotency |
| bills[].offlineCreatedAt | string | Yes | ISO timestamp of when the bill was created offline |
| bills[].items | array | Yes | Min 1 item. Same shape as `POST /bills` |
| bills[].payments | array | Yes | Min 1 payment. Same shape as `POST /bills` |
| bills[].customerId | uuid | No | |
| bills[].additionalDiscountAmount | number | No | |
| bills[].additionalDiscountPct | number | No | 0-100 |
| bills[].notes | string | No | |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "synced": [
      { "clientId": "uuid", "serverBillId": "uuid", "billNumber": "KVB-2026-00042" }
    ],
    "conflicts": [
      { "clientId": "uuid", "conflictId": "uuid", "reason": "Product price changed since offline sale" }
    ]
  }
}
```

---

### `POST /bills/hold`

Save the current cart as a held (draft) bill. Useful when a customer needs to step away mid-billing.

**Auth:** Required (any role)

**Request Body:**
```json
{
  "items": [
    { "productId": "uuid", "quantity": 2 }
  ],
  "customerId": "uuid",
  "additionalDiscountAmount": 50,
  "notes": "Customer went to get more items"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| items | array | Yes | Min 1 item |
| items[].productId | uuid | Yes | |
| items[].quantity | integer | Yes | Positive |
| customerId | uuid | No | |
| additionalDiscountAmount | number | No | |
| notes | string | No | |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "items": [ ... ],
    "customerId": "uuid",
    "notes": "Customer went to get more items",
    "createdAt": "2026-04-01T10:30:00.000Z"
  }
}
```

---

### `GET /bills/held`

List all held (draft) bills for the tenant.

**Auth:** Required (any role)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "items": [ { "productId": "uuid", "quantity": 2 } ],
      "customerId": "uuid",
      "notes": "Customer went to get more items",
      "createdAt": "2026-04-01T10:30:00.000Z"
    }
  ]
}
```

---

### `POST /bills/held/:id/resume`

Resume a held bill. Returns the saved cart data and deletes the held bill record.

**Auth:** Required (any role)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [ { "productId": "uuid", "quantity": 2 } ],
    "customerId": "uuid",
    "additionalDiscountAmount": 50,
    "notes": "Customer went to get more items"
  }
}
```

---

### `DELETE /bills/held/:id`

Discard a held bill permanently.

**Auth:** Required (any role)

**Response (200):**
```json
{ "success": true, "data": { "deleted": true } }
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
  "poId": "uuid",
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
| poId | uuid | No | Link to a purchase order |
| invoiceNumber | string | No | Supplier's invoice number. Max 50 |
| invoiceDate | string | No | YYYY-MM-DD |
| invoiceImageUrl | string | No | S3 key from presigned upload (must be valid URL) |
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
    "todayProfit": 8200,
    "cashInHand": 15650,
    "outstandingReceivables": 145000,
    "outstandingPayables": 89000,
    "lowStockCount": 5,
    "agingInventoryCount": 23,
    "recentBills": [ { "id": "...", "billNumber": "KVB-2026-00042", "netAmount": "750.00", "createdAt": "..." } ],
    "paymentModeSplit": { "cash": 12000, "upi": 8500, "card": 4000 },
    "topSellers": [
      { "productId": "uuid", "productName": "Rupa RN Vest - L", "quantitySold": 45, "revenue": 15750 }
    ],
    "supplierPaymentsDue": [
      { "supplierId": "uuid", "supplierName": "Rupa & Company Ltd", "amountDue": 25000, "dueDate": "2026-04-15" }
    ]
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

## 17. Purchase Orders

**Auth:** Required (owner/manager only)

### `POST /purchase-orders`

Create a purchase order for a supplier.

**Request Body:**
```json
{
  "supplierId": "uuid",
  "notes": "Urgent restock for Diwali season",
  "items": [
    { "productId": "uuid", "orderedQty": 100, "expectedCost": 200 },
    { "productId": "uuid", "orderedQty": 50, "expectedCost": 700 }
  ]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| supplierId | uuid | Yes | |
| notes | string | No | |
| items | array | Yes | Min 1 item |
| items[].productId | uuid | Yes | |
| items[].orderedQty | integer | Yes | Positive |
| items[].expectedCost | number | Yes | Positive |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "supplierId": "uuid",
    "status": "draft",
    "notes": "Urgent restock for Diwali season",
    "items": [
      { "productId": "uuid", "orderedQty": 100, "expectedCost": "200.00" }
    ],
    "createdAt": "2026-04-01T10:30:00.000Z"
  }
}
```

---

### `GET /purchase-orders`

List purchase orders with filters.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| supplier_id | uuid | Filter by supplier |
| status | string | Filter by status (`"draft"`, `"sent"`, `"received"`, `"cancelled"`) |
| limit | number | Default 20 |
| offset | number | Default 0 |

---

### `GET /purchase-orders/:id`

Get purchase order detail with all items.

---

### `PATCH /purchase-orders/:id`

Update a purchase order.

**Request Body:**
```json
{
  "notes": "Updated delivery instructions",
  "status": "sent"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| notes | string | No | At least one of `notes` or `status` must be provided |
| status | enum | No | `"sent"` or `"cancelled"` |

---

### `GET /purchase-orders/:id/pdf`

Get purchase order data formatted for print/PDF generation.

---

## 18. Purchase Returns

**Auth:** Required (owner/manager only)

### `POST /purchase-returns`

Return items to a supplier. Reverses stock and creates a supplier ledger credit entry.

**Request Body:**
```json
{
  "purchaseId": "uuid",
  "items": [
    { "productId": "uuid", "quantity": 3, "costPrice": 200 },
    { "productId": "uuid", "quantity": 1, "costPrice": 700 }
  ],
  "reason": "Defective batch received"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| purchaseId | uuid | Yes | The original purchase to return against |
| items | array | Yes | Min 1 item |
| items[].productId | uuid | Yes | |
| items[].quantity | integer | Yes | Positive |
| items[].costPrice | number | Yes | Positive |
| reason | string | No | |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "purchaseId": "uuid",
    "totalAmount": "1300.00",
    "reason": "Defective batch received",
    "items": [ ... ],
    "createdAt": "2026-04-01T10:30:00.000Z"
  }
}
```

---

## 19. Expenses

**Auth:** Required (owner/manager only)

### `GET /expenses`

List expenses with filters.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| category | string | Filter by expense category |
| from | string | Start date (ISO) |
| to | string | End date (ISO) |
| is_recurring | boolean | Filter recurring expenses |
| limit | number | Default 20 |
| offset | number | Default 0 |

---

### `POST /expenses`

Create an expense record.

**Request Body:**
```json
{
  "category": "Rent",
  "amount": 25000,
  "description": "Monthly shop rent for April",
  "expenseDate": "2026-04-01",
  "isRecurring": true,
  "recurrenceInterval": "monthly",
  "receiptImageUrl": "https://s3-bucket.../receipt.pdf"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| category | string | Yes | Min 1 character |
| amount | number | Yes | Must be positive |
| description | string | No | |
| expenseDate | string | Yes | Date of the expense |
| isRecurring | boolean | No | Default false |
| recurrenceInterval | enum | No | `"monthly"`, `"quarterly"`, `"yearly"`. Only relevant if `isRecurring` is true |
| receiptImageUrl | string | No | Must be valid URL |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "category": "Rent",
    "amount": "25000.00",
    "description": "Monthly shop rent for April",
    "expenseDate": "2026-04-01",
    "isRecurring": true,
    "recurrenceInterval": "monthly",
    "createdAt": "2026-04-01T10:30:00.000Z"
  }
}
```

---

### `GET /expenses/categories`

List expense categories. Returns hardcoded default categories plus any custom categories that have been used.

**Response (200):**
```json
{
  "success": true,
  "data": ["Rent", "Electricity", "Salary", "Transport", "Packaging", "Miscellaneous", "Marketing"]
}
```

---

### `GET /expenses/:id`

Get expense detail.

---

### `PUT /expenses/:id`

Update an expense. Same fields as create, all optional (at least 1 required).

---

### `DELETE /expenses/:id`

Hard-delete an expense record.

**Response (200):**
```json
{ "success": true, "data": { "deleted": true } }
```

---

## 20. GST

**Auth:** Required (owner/manager only)

All GST endpoints return scheme-dependent data based on the tenant's GST registration type (Regular or Composition).

### `GET /gst/summary`

Get a GST summary for a date range.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| from | string | Yes | Start date (ISO) |
| to | string | Yes | End date (ISO) |

---

### `GET /gst/gstr1`

Get GSTR-1 outward supply data for a date range. Used for filing monthly/quarterly GSTR-1.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| from | string | Yes | Start date (ISO) |
| to | string | Yes | End date (ISO) |

---

### `GET /gst/gstr3b`

Get GSTR-3B summary data for a date range.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| from | string | Yes | Start date (ISO) |
| to | string | Yes | End date (ISO) |

---

### `GET /gst/cmp08`

Get CMP-08 quarterly statement data. Only applicable for Composition scheme taxpayers.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| quarter | integer | Yes | Quarter number (1-4) |
| fy | string | Yes | Financial year in `"YYYY-YYYY"` format (e.g., `"2025-2026"`) |

---

### `GET /gst/gstr4`

Get GSTR-4 annual return data. Only applicable for Composition scheme taxpayers.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| fy | string | Yes | Financial year in `"YYYY-YYYY"` format (e.g., `"2025-2026"`) |

---

### `GET /gst/itc`

Get Input Tax Credit (ITC) register data. **Regular scheme only** — rejects Composition scheme tenants.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| from | string | Yes | Start date (ISO) |
| to | string | Yes | End date (ISO) |

---

### `GET /gst/hsn-summary`

Get HSN-wise summary data for a date range. Groups sales and purchases by HSN code.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| from | string | Yes | Start date (ISO) |
| to | string | Yes | End date (ISO) |

---

## 21. Reports

**Auth:** Required (owner/manager only)

### `GET /reports/:type`

Fetch report data by type. All reports support date range filtering and pagination.

**Path Parameter:**

| Param | Type | Description |
|-------|------|-------------|
| type | string | One of 17 report types (see below) |

**Available Report Types:**

| Type | Description |
|------|-------------|
| `daily-sales` | Sales breakdown by day |
| `sales-by-category` | Sales grouped by product category |
| `sales-by-salesperson` | Sales grouped by salesperson |
| `inventory-valuation` | Current inventory value at cost |
| `low-stock` | Products below minimum stock level |
| `outstanding-payables` | Amounts owed to suppliers |
| `outstanding-receivables` | Amounts owed by customers |
| `customer-ledger` | Transaction history for a specific customer |
| `supplier-ledger` | Transaction history for a specific supplier |
| `cash-register` | Cash register session summaries |
| `pnl` | Profit & Loss statement |
| `purchase-summary` | Purchase totals by supplier/period |
| `expense` | Expense breakdown by category/period |
| `gst-summary` | GST collected and paid summary |
| `bargain-discount` | Analysis of additional (bargain) discounts given |
| `aging-inventory` | Products exceeding aging threshold |
| `dead-stock` | Products with zero sales in the period |

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| from | string | Start date (ISO) |
| to | string | End date (ISO) |
| limit | number | Pagination limit |
| offset | number | Pagination offset |
| party_id | uuid | Customer or supplier ID (for ledger reports) |
| register_id | uuid | Cash register ID (for register report) |

---

### `POST /reports/:type/export`

Queue a report export job. (Stub — returns placeholder response.)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "jobId": "not_implemented",
    "message": "Export coming soon"
  }
}
```

---

### `GET /reports/export/:jobId`

Download an exported report file. (Stub — returns placeholder response.)

**Response (200):**
```json
{
  "success": true,
  "data": { "status": "not_implemented" }
}
```

---

## 22. Audit Log

**Auth:** Required (owner only)

### `GET /audit-logs`

List audit log entries. Every write operation (POST/PUT/PATCH/DELETE) is automatically logged.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| user_id | uuid | Filter by user who performed the action |
| action | string | Filter by action type (e.g., `"create"`, `"update"`, `"delete"`) |
| entity_type | string | Filter by entity type (e.g., `"bill"`, `"product"`, `"purchase"`) |
| from | string | Start date (ISO) |
| to | string | End date (ISO) |
| limit | number | Default 20 |
| offset | number | Default 0 |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "userName": "Mayank Kaushik",
      "action": "create",
      "entityType": "bill",
      "entityId": "uuid",
      "metadata": { ... },
      "createdAt": "2026-04-01T10:30:00.000Z"
    }
  ],
  "meta": { "has_more": true }
}
```

---

## 23. Returns

**Auth:** Required. Create = owner/manager. Read = any role.

### `POST /returns`

Process a customer return. Handles cash refund, credit note, or exchange. Reverses stock and ledger entries for the returned items.

**Request Body:**
```json
{
  "originalBillId": "uuid",
  "refundMode": "cash",
  "reason": "Size mismatch",
  "items": [
    { "billItemId": "uuid", "quantity": 1 }
  ],
  "exchangeBillId": "uuid"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| originalBillId | uuid | Yes | The bill being returned against |
| refundMode | enum | Yes | `"cash"`, `"credit_note"`, or `"exchange"` |
| reason | string | No | |
| items | array | Yes | Min 1 item |
| items[].billItemId | uuid | Yes | The specific line item from the original bill |
| items[].quantity | integer | Yes | Positive. Cannot exceed original quantity |
| exchangeBillId | uuid | No | Required if `refundMode` is `"exchange"` |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "originalBillId": "uuid",
    "refundMode": "cash",
    "reason": "Size mismatch",
    "totalRefundAmount": "350.00",
    "items": [
      { "billItemId": "uuid", "productId": "uuid", "productName": "Rupa RN Vest - L", "quantity": 1, "refundAmount": "350.00" }
    ],
    "createdAt": "2026-04-01T10:30:00.000Z"
  }
}
```

**Error Responses:**
- `RETURN_WINDOW_EXPIRED` (422) — return window (configured in settings) has elapsed
- `VALIDATION_ERROR` (400) — quantity exceeds original, invalid bill item, etc.

---

### `GET /returns`

List returns with filters.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| original_bill_id | uuid | Filter by original bill |
| limit | number | Default 20 |
| offset | number | Default 0 |

---

### `GET /returns/:id`

Get return detail with all items.

---

## 24. Sync Conflicts

**Auth:** Required (owner/manager)

Sync conflicts arise when offline bills cannot be cleanly merged during `POST /bills/sync`.

### `GET /sync-conflicts`

List sync conflicts.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| status | string | Filter by status. Default: `"pending"`. Options: `"pending"`, `"resolved"` |
| limit | number | Default 20 |
| offset | number | Default 0 |

---

### `POST /sync-conflicts/:id/resolve`

Resolve a sync conflict.

**Request Body:**
```json
{
  "action": "force_accepted",
  "notes": "Verified amounts match physical receipt"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| action | enum | Yes | `"force_accepted"`, `"edited"`, or `"voided"` |
| notes | string | No | |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "resolved",
    "action": "force_accepted",
    "resolvedBy": "uuid",
    "resolvedAt": "2026-04-01T14:00:00.000Z"
  }
}
```

---

### `GET /sync-conflicts/count`

Get the count of unresolved sync conflicts. Used for badge/notification display.

**Response (200):**
```json
{
  "success": true,
  "data": { "count": 3 }
}
```

---

## 25. Notifications

**Auth:** Required (any role)

### `GET /notifications`

List notifications for the current user.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| limit | number | Default 20 |
| offset | number | Default 0 |

---

### `PATCH /notifications/:id/read`

Mark a single notification as read.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "readAt": "2026-04-01T14:00:00.000Z"
  }
}
```

---

### `PATCH /notifications/read-all`

Mark all notifications as read for the current user.

**Response (200):**
```json
{
  "success": true,
  "data": { "markedCount": 12 }
}
```

---

### `GET /notifications/unread-count`

Get the count of unread notifications. Used for badge display.

**Response (200):**
```json
{
  "success": true,
  "data": { "count": 5 }
}
```

---

## 26. Self-Service Signup

### `POST /signup`

Public self-service registration. Creates a new tenant with the owner account, seeds defaults, and auto-logs in the new owner.

**Auth:** None (public)

**Request Body:**
```json
{
  "storeName": "New Clothing Store",
  "ownerName": "Rajesh Kumar",
  "phone": "9999888877",
  "password": "securepass123",
  "email": "rajesh@example.com",
  "address": "Market Road, Town Center",
  "gstin": "09ABCDE1234F1Z5",
  "gstScheme": "regular"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| storeName | string | Yes | Min 1 character |
| ownerName | string | Yes | Min 1 character |
| phone | string | Yes | Min 10 characters |
| password | string | Yes | Min 6 characters |
| email | string | No | Must be valid email |
| address | string | No | |
| gstin | string | No | Max 15 characters |
| gstScheme | enum | No | `"regular"` (default) or `"composition"` |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "tenant": {
      "id": "uuid",
      "name": "New Clothing Store",
      "gstScheme": "regular"
    },
    "owner": {
      "id": "uuid",
      "tenantId": "uuid",
      "name": "Rajesh Kumar",
      "phone": "9999888877",
      "email": "rajesh@example.com",
      "role": "owner"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiJ9..."
  }
}
```

**Also sets:** `Set-Cookie: refreshToken=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`

---

## 27. Super Admin

Platform administration endpoints for managing tenants across the system.

### `POST /admin/login`

Super admin login.

**Auth:** None (public)

**Request Body:**
```json
{
  "email": "admin@inventrack.com",
  "password": "admin-password"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| email | string | Yes | Must be valid email |
| password | string | Yes | |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "admin": {
      "id": "uuid",
      "email": "admin@inventrack.com",
      "role": "super_admin"
    }
  }
}
```

**Also sets:** `Set-Cookie: adminRefreshToken=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/admin`

---

### `POST /admin/refresh`

Rotate admin refresh token and get a new access token.

**Auth:** None (uses `adminRefreshToken` cookie)

**Request Body:** None (cookie sent automatically)

**Response (200):**
```json
{
  "success": true,
  "data": { "accessToken": "eyJhbGciOiJIUzI1NiJ9..." }
}
```

---

### `GET /admin/dashboard`

Get platform-wide metrics.

**Auth:** Required (super admin only)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "tenantsByStatus": { "active": 150, "suspended": 3 },
    "tenantsByPlan": { "free": 100, "basic": 40, "pro": 13 },
    "billsThisMonth": 12500,
    "signupsThisMonth": 25,
    "totalUsers": 480
  }
}
```

---

### `GET /admin/tenants`

List all tenants on the platform.

**Auth:** Required (super admin only)

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| status | string | Filter by status (`"active"`, `"suspended"`) |
| plan | string | Filter by plan (`"free"`, `"basic"`, `"pro"`) |
| limit | number | Default 20 (max 100) |
| offset | number | Default 0 |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Kaushik Vastra Bhandar",
      "status": "active",
      "plan": "basic",
      "user_count": 4,
      "createdAt": "2026-01-15T08:00:00.000Z"
    }
  ],
  "meta": { "has_more": true }
}
```

---

### `GET /admin/tenants/:id`

Get detailed tenant information with usage metrics.

**Auth:** Required (super admin only)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Kaushik Vastra Bhandar",
    "status": "active",
    "plan": "basic",
    "gstScheme": "regular",
    "metrics": {
      "productCount": 250,
      "userCount": 4,
      "billCount": 1200,
      "customerCount": 350,
      "supplierCount": 25,
      "lastActivity": "2026-04-01T10:30:00.000Z"
    },
    "createdAt": "2026-01-15T08:00:00.000Z"
  }
}
```

---

### `PATCH /admin/tenants/:id`

Update a tenant's status or plan.

**Auth:** Required (super admin only)

**Request Body:**
```json
{
  "status": "suspended",
  "plan": "pro"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| status | enum | No | `"active"` or `"suspended"` |
| plan | enum | No | `"free"`, `"basic"`, or `"pro"` |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Kaushik Vastra Bhandar",
    "status": "suspended",
    "plan": "pro"
  }
}
```

---

## 28. Error Codes

| Code | HTTP Status | When |
|------|-------------|------|
| `VALIDATION_ERROR` | 400 | Invalid input (missing fields, wrong format, unbalanced payments) |
| `UNAUTHORIZED` | 401 | Missing or expired token |
| `FORBIDDEN` | 403 | Role doesn't have permission |
| `DISCOUNT_LIMIT_EXCEEDED` | 403 | Salesperson exceeded max additional discount |
| `NOT_FOUND` | 404 | Entity not found or belongs to another tenant |
| `DUPLICATE_ENTRY` | 409 | SKU, barcode, or phone already exists in this tenant |
| `SYNC_CONFLICT` | 409 | Offline bill conflicts with server state during sync |
| `RETURN_WINDOW_EXPIRED` | 422 | Return attempted after the configured return window has elapsed |
| `RATE_LIMITED` | 429 | Too many requests |
| `TENANT_SUSPENDED` | 403 | Tenant account has been suspended |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

*126 endpoints total across 22 route groups. Phases 1-4 complete.*

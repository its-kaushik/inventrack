/**
 * Generates a complete OpenAPI 3.1 spec for InvenTrack API.
 * Since routes use plain Hono (not @hono/zod-openapi createRoute),
 * we define the spec manually to populate Swagger UI.
 */
export function generateOpenApiSpec() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'InvenTrack API',
      version: '1.0.0',
      description: 'Multi-tenant retail inventory, POS & credit management system',
    },
    servers: [{ url: '/api/v1', description: 'API v1' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication & user management' },
      { name: 'Admin', description: 'Tenant management (Super Admin)' },
      { name: 'Settings', description: 'Tenant settings & GST config' },
      { name: 'Products', description: 'Product catalog, categories, brands' },
      { name: 'Inventory', description: 'Stock levels, adjustments, movements' },
      { name: 'Suppliers', description: 'Supplier directory & credit' },
      { name: 'Purchases', description: 'Purchase orders & goods receipts' },
      { name: 'Customers', description: 'Customer directory & khata' },
      { name: 'POS', description: 'Point of sale, billing, returns' },
      { name: 'Credit', description: 'Credit management summaries' },
      { name: 'Expenses', description: 'Expense tracking & cash register' },
      { name: 'Labels', description: 'Barcode label generation' },
      { name: 'Reports', description: 'Dashboard & analytics reports' },
      { name: 'Sync', description: 'Offline sync & conflict resolution' },
      { name: 'Migration', description: 'Data migration / CSV import' },
      { name: 'Notifications', description: 'In-app notifications' },
    ],
    paths: {
      // ── Auth ──
      '/auth/login': {
        post: { tags: ['Auth'], summary: 'Login with email/phone + password', security: [],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { emailOrPhone: { type: 'string' }, password: { type: 'string' } }, required: ['emailOrPhone', 'password'] } } } },
          responses: { 200: { description: 'JWT tokens + user profile' }, 401: { description: 'Invalid credentials' } } },
      },
      '/auth/refresh': { post: { tags: ['Auth'], summary: 'Refresh access token', security: [] } },
      '/auth/logout': { post: { tags: ['Auth'], summary: 'Logout (invalidate refresh token)', security: [] } },
      '/auth/forgot-password': { post: { tags: ['Auth'], summary: 'Request password reset', security: [] } },
      '/auth/reset-password': { post: { tags: ['Auth'], summary: 'Reset password with token', security: [] } },
      '/auth/me': { get: { tags: ['Auth'], summary: 'Get current user profile' } },
      '/auth/pin': { post: { tags: ['Auth'], summary: 'Set/change Owner PIN' } },
      '/auth/pin/verify': { post: { tags: ['Auth'], summary: 'Verify Owner PIN, get approval token' } },

      // ── Users ──
      '/users': {
        get: { tags: ['Auth'], summary: 'List tenant users' },
      },
      '/users/invite': { post: { tags: ['Auth'], summary: 'Invite new staff member' } },
      '/users/{id}': {
        get: { tags: ['Auth'], summary: 'Get user by ID', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }] },
        patch: { tags: ['Auth'], summary: 'Update user' },
        delete: { tags: ['Auth'], summary: 'Deactivate user' },
      },

      // ── Admin ──
      '/admin/tenants': {
        get: { tags: ['Admin'], summary: 'List all tenants' },
        post: { tags: ['Admin'], summary: 'Create tenant' },
      },
      '/admin/tenants/{id}': {
        get: { tags: ['Admin'], summary: 'Get tenant details' },
        patch: { tags: ['Admin'], summary: 'Update tenant' },
        delete: { tags: ['Admin'], summary: 'Delete tenant' },
      },
      '/admin/tenants/{id}/suspend': { post: { tags: ['Admin'], summary: 'Suspend tenant' } },
      '/admin/tenants/{id}/reactivate': { post: { tags: ['Admin'], summary: 'Reactivate tenant' } },

      // ── Settings ──
      '/settings': {
        get: { tags: ['Settings'], summary: 'Get tenant settings' },
        patch: { tags: ['Settings'], summary: 'Update tenant settings' },
      },
      '/settings/gst': {
        get: { tags: ['Settings'], summary: 'Get GST configuration' },
        patch: { tags: ['Settings'], summary: 'Update GST scheme/GSTIN' },
      },

      // ── Products ──
      '/products': {
        get: { tags: ['Products'], summary: 'List products (search, filter, paginate)', parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'categoryId', in: 'query', schema: { type: 'string' } },
          { name: 'brandId', in: 'query', schema: { type: 'string' } },
          { name: 'isArchived', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ] },
        post: { tags: ['Products'], summary: 'Create product (simple or variant)' },
      },
      '/products/{id}': {
        get: { tags: ['Products'], summary: 'Get product with variants & images' },
        patch: { tags: ['Products'], summary: 'Update product' },
        delete: { tags: ['Products'], summary: 'Archive product' },
      },
      '/products/{id}/unarchive': { post: { tags: ['Products'], summary: 'Unarchive product' } },
      '/products/{id}/images/upload-url': { post: { tags: ['Products'], summary: 'Get S3 pre-signed upload URL' } },
      '/products/{id}/images': { post: { tags: ['Products'], summary: 'Confirm image upload' } },
      '/products/{id}/images/{imageId}': { delete: { tags: ['Products'], summary: 'Delete image' } },
      '/products/categories': {
        get: { tags: ['Products'], summary: 'List categories' },
        post: { tags: ['Products'], summary: 'Create category' },
      },
      '/products/categories/{id}': { patch: { tags: ['Products'], summary: 'Update category' }, delete: { tags: ['Products'], summary: 'Delete category' } },
      '/products/brands': { get: { tags: ['Products'], summary: 'List brands' }, post: { tags: ['Products'], summary: 'Create brand' } },
      '/products/brands/{id}': { patch: { tags: ['Products'], summary: 'Update brand' }, delete: { tags: ['Products'], summary: 'Delete brand' } },
      '/products/hsn-codes': { get: { tags: ['Products'], summary: 'Search HSN codes' } },

      // ── Inventory ──
      '/inventory': { get: { tags: ['Inventory'], summary: 'List stock levels' } },
      '/inventory/adjust': { post: { tags: ['Inventory'], summary: 'Manual stock adjustment' } },
      '/inventory/{variantId}/movements': { get: { tags: ['Inventory'], summary: 'Stock movement history' } },
      '/inventory/stock-count': { post: { tags: ['Inventory'], summary: 'Submit physical stock count' } },
      '/inventory/low-stock': { get: { tags: ['Inventory'], summary: 'Items below threshold' } },
      '/inventory/aging': { get: { tags: ['Inventory'], summary: 'Items past aging threshold' } },

      // ── Suppliers ──
      '/suppliers': { get: { tags: ['Suppliers'], summary: 'List suppliers' }, post: { tags: ['Suppliers'], summary: 'Create supplier' } },
      '/suppliers/{id}': { get: { tags: ['Suppliers'], summary: 'Get supplier' }, patch: { tags: ['Suppliers'], summary: 'Update supplier' }, delete: { tags: ['Suppliers'], summary: 'Deactivate supplier' } },
      '/suppliers/{id}/ledger': { get: { tags: ['Suppliers'], summary: 'Supplier transaction ledger' } },
      '/suppliers/{id}/payments': { post: { tags: ['Suppliers'], summary: 'Record payment to supplier' } },

      // ── Purchases ──
      '/purchase-orders': { get: { tags: ['Purchases'], summary: 'List purchase orders' }, post: { tags: ['Purchases'], summary: 'Create purchase order' } },
      '/purchase-orders/{id}': { get: { tags: ['Purchases'], summary: 'Get PO detail' }, patch: { tags: ['Purchases'], summary: 'Update PO' } },
      '/purchase-orders/{id}/send': { post: { tags: ['Purchases'], summary: 'Send PO (draft → sent)' } },
      '/purchase-orders/{id}/cancel': { post: { tags: ['Purchases'], summary: 'Cancel PO' } },
      '/purchase-orders/returns': { post: { tags: ['Purchases'], summary: 'Create purchase return' } },
      '/goods-receipts': { get: { tags: ['Purchases'], summary: 'List goods receipts' }, post: { tags: ['Purchases'], summary: 'Record goods receipt' } },
      '/goods-receipts/{id}': { get: { tags: ['Purchases'], summary: 'Get receipt detail' } },

      // ── Customers ──
      '/customers': { get: { tags: ['Customers'], summary: 'List customers' }, post: { tags: ['Customers'], summary: 'Create customer' } },
      '/customers/{id}': { get: { tags: ['Customers'], summary: 'Get customer profile' }, patch: { tags: ['Customers'], summary: 'Update customer' } },
      '/customers/{id}/ledger': { get: { tags: ['Customers'], summary: 'Customer credit ledger' } },
      '/customers/{id}/payments': { post: { tags: ['Customers'], summary: 'Record credit payment' } },

      // ── POS ──
      '/sales': { get: { tags: ['POS'], summary: 'List bills' }, post: { tags: ['POS'], summary: 'Create sale (POS billing)' } },
      '/sales/park': { post: { tags: ['POS'], summary: 'Park a bill' } },
      '/sales/parked': { get: { tags: ['POS'], summary: 'List parked bills' } },
      '/sales/parked/{id}/recall': { post: { tags: ['POS'], summary: 'Recall parked bill' } },
      '/sales/parked/{id}': { delete: { tags: ['POS'], summary: 'Delete parked bill' } },
      '/sales/returns': { get: { tags: ['POS'], summary: 'List returns' }, post: { tags: ['POS'], summary: 'Process return/exchange' } },
      '/sales/returns/{id}': { get: { tags: ['POS'], summary: 'Get return detail' } },
      '/sales/{id}': { get: { tags: ['POS'], summary: 'Get bill detail' } },
      '/sales/{id}/void': { post: { tags: ['POS'], summary: 'Void a bill (requires Owner PIN)' } },

      // ── Credit ──
      '/credit/customers/summary': { get: { tags: ['Credit'], summary: 'Customer khata summary with aging' } },
      '/credit/suppliers/summary': { get: { tags: ['Credit'], summary: 'Supplier payables summary with aging' } },

      // ── Expenses ──
      '/expenses': { get: { tags: ['Expenses'], summary: 'List expenses' }, post: { tags: ['Expenses'], summary: 'Create expense' } },
      '/expenses/categories': { get: { tags: ['Expenses'], summary: 'List expense categories' }, post: { tags: ['Expenses'], summary: 'Create category' } },
      '/expenses/{id}': { get: { tags: ['Expenses'], summary: 'Get expense' }, patch: { tags: ['Expenses'], summary: 'Update expense' }, delete: { tags: ['Expenses'], summary: 'Delete expense' } },
      '/cash-register/open': { post: { tags: ['Expenses'], summary: 'Open cash register' } },
      '/cash-register/close': { post: { tags: ['Expenses'], summary: 'Close cash register' } },
      '/cash-register/current': { get: { tags: ['Expenses'], summary: 'Get today\'s register' } },
      '/cash-register/{date}': { get: { tags: ['Expenses'], summary: 'Get register by date' } },

      // ── Labels ──
      '/labels/generate': { post: { tags: ['Labels'], summary: 'Generate label PDF' } },
      '/labels/templates': { get: { tags: ['Labels'], summary: 'List label templates' } },

      // ── Reports ──
      '/reports/dashboard': { get: { tags: ['Reports'], summary: 'Dashboard summary' } },
      '/reports/current-stock': { get: { tags: ['Reports'], summary: 'Current stock report' } },
      '/reports/inventory-valuation': { get: { tags: ['Reports'], summary: 'Inventory valuation' } },
      '/reports/dead-stock': { get: { tags: ['Reports'], summary: 'Dead/slow-moving stock' } },
      '/reports/low-stock': { get: { tags: ['Reports'], summary: 'Low stock report' } },
      '/reports/supplier-purchases': { get: { tags: ['Reports'], summary: 'Purchases by supplier' } },
      '/reports/purchase-summary': { get: { tags: ['Reports'], summary: 'Purchase summary' } },
      '/reports/sales-summary': { get: { tags: ['Reports'], summary: 'Sales summary (revenue, COGS, profit)' } },
      '/reports/sales-by-category': { get: { tags: ['Reports'], summary: 'Sales by category' } },
      '/reports/sales-by-product': { get: { tags: ['Reports'], summary: 'Sales by product' } },
      '/reports/sales-by-brand': { get: { tags: ['Reports'], summary: 'Sales by brand' } },
      '/reports/sales-trend': { get: { tags: ['Reports'], summary: 'Sales trend (daily)' } },
      '/reports/profit-margins': { get: { tags: ['Reports'], summary: 'Product profit margins' } },
      '/reports/pnl': { get: { tags: ['Reports'], summary: 'P&L statement' } },
      '/reports/discount-impact': { get: { tags: ['Reports'], summary: 'Discount impact analysis' } },
      '/reports/customer-outstanding': { get: { tags: ['Reports'], summary: 'Customer credit outstanding' } },
      '/reports/supplier-outstanding': { get: { tags: ['Reports'], summary: 'Supplier credit outstanding' } },
      '/reports/credit-aging': { get: { tags: ['Reports'], summary: 'Credit aging buckets' } },
      '/reports/payment-collections': { get: { tags: ['Reports'], summary: 'Payment collections by customer' } },
      '/reports/staff-activity': { get: { tags: ['Reports'], summary: 'Staff activity report' } },
      '/reports/expense-summary': { get: { tags: ['Reports'], summary: 'Expense summary by category' } },
      '/reports/gst-summary': { get: { tags: ['Reports'], summary: 'GST summary' } },
      '/reports/hsn-summary': { get: { tags: ['Reports'], summary: 'HSN-wise summary' } },
      '/reports/gstr1-export': { get: { tags: ['Reports'], summary: 'GSTR-1 CSV export' } },
      '/reports/gstr3b-export': { get: { tags: ['Reports'], summary: 'GSTR-3B CSV export' } },
      '/reports/cmp08-export': { get: { tags: ['Reports'], summary: 'CMP-08 CSV export' } },

      // ── Sync ──
      '/sync/catalog': { get: { tags: ['Sync'], summary: 'Download catalog for offline cache' } },
      '/sync/bills': { post: { tags: ['Sync'], summary: 'Upload offline bills' } },
      '/sync/conflicts': { get: { tags: ['Sync'], summary: 'List sync conflicts' } },
      '/sync/conflicts/{id}/resolve': { post: { tags: ['Sync'], summary: 'Resolve a conflict' } },

      // ── Migration ──
      '/migration/customers': { post: { tags: ['Migration'], summary: 'Import customer khata from CSV' } },
      '/migration/suppliers': { post: { tags: ['Migration'], summary: 'Import supplier balances from CSV' } },
      '/migration/templates/{type}': { get: { tags: ['Migration'], summary: 'Download CSV import template' } },

      // ── Notifications ──
      '/notifications': { get: { tags: ['Notifications'], summary: 'List notifications' } },
      '/notifications/{id}/read': { patch: { tags: ['Notifications'], summary: 'Mark as read' } },
      '/notifications/mark-all-read': { post: { tags: ['Notifications'], summary: 'Mark all as read' } },
    },
  };
}

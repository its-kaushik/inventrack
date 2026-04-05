// User roles
export type Role = 'super_admin' | 'owner' | 'manager' | 'salesman';

// Tenant
export type GstScheme = 'composite' | 'regular';
export type TenantStatus = 'active' | 'suspended' | 'deleted';

// Sales
export type SaleStatus = 'completed' | 'cancelled' | 'returned' | 'partially_returned';
export type SaleChannel = 'in_store' | 'online';
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'credit';

// Purchase Orders
export type POStatus = 'draft' | 'sent' | 'partially_received' | 'fully_received' | 'cancelled';

// Payments
export type PaymentMode = 'paid' | 'credit' | 'partial';
export type SupplierPaymentTerms = 'cod' | 'net_15' | 'net_30' | 'net_60' | 'advance';

// Inventory
export type MovementType = 'purchase' | 'sale' | 'sale_return' | 'purchase_return' | 'adjustment' | 'opening_balance';
export type AdjustmentReason = 'damage' | 'theft' | 'count_correction' | 'expired' | 'other';

// Returns
export type ReturnType = 'full' | 'partial' | 'exchange';
export type RefundMode = 'cash' | 'khata' | 'exchange' | 'store_credit';
export type ReturnReason = 'size_issue' | 'defect' | 'changed_mind' | 'color_mismatch' | 'other';

// Credit
export type CustomerTransactionType = 'sale_credit' | 'payment' | 'return_adjustment' | 'opening_balance';
export type SupplierTransactionType = 'purchase_credit' | 'payment' | 'return_adjustment' | 'opening_balance';

// Cash Register
export type CashRegisterStatus = 'open' | 'closed';

// Notifications
export type NotificationPriority = 'high' | 'medium' | 'low';

// Sync Conflicts
export type ConflictType = 'negative_stock' | 'duplicate_customer' | 'stale_price' | 'bill_number_collision';
export type ConflictStatus = 'unresolved' | 'resolved';

// Expenses
export type ExpensePaymentMode = 'cash' | 'upi' | 'bank_transfer';

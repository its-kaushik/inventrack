import { sql } from 'drizzle-orm';
import { ledgerEntries } from '../db/schema/ledger-entries.js';
import { customers } from '../db/schema/customers.js';
import { suppliers } from '../db/schema/suppliers.js';
import type { PartyType, LedgerEntryType, GeneralPaymentMode } from '../types/enums.js';

interface CreateLedgerEntryParams {
  tenantId: string;
  partyType: PartyType;
  partyId: string;
  entryType: LedgerEntryType;
  debit: number;
  credit: number;
  referenceType?: string;
  referenceId?: string;
  paymentMode?: GeneralPaymentMode;
  paymentReference?: string;
  dueDate?: string;
  description?: string;
  createdBy?: string;
}

export async function createEntry(tx: any, params: CreateLedgerEntryParams) {
  const [entry] = await tx.insert(ledgerEntries).values({
    tenantId: params.tenantId,
    partyType: params.partyType,
    partyId: params.partyId,
    entryType: params.entryType,
    debit: String(params.debit),
    credit: String(params.credit),
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    paymentMode: params.paymentMode,
    paymentReference: params.paymentReference,
    dueDate: params.dueDate,
    description: params.description,
    createdBy: params.createdBy,
  }).returning();

  return entry;
}

export async function updateCustomerBalance(tx: any, tenantId: string, customerId: string, amount: number) {
  await tx.execute(
    sql`UPDATE customers SET outstanding_balance = outstanding_balance + ${String(amount)} WHERE id = ${customerId} AND tenant_id = ${tenantId}`
  );
}

export async function updateSupplierBalance(tx: any, tenantId: string, supplierId: string, amount: number) {
  await tx.execute(
    sql`UPDATE suppliers SET outstanding_balance = outstanding_balance + ${String(amount)} WHERE id = ${supplierId} AND tenant_id = ${tenantId}`
  );
}

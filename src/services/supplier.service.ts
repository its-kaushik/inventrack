import { eq, and, or, ilike, isNull, asc, desc, count, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { suppliers, supplierTransactions } from '../db/schema/suppliers.js';
import { AppError } from '../types/errors.js';
import { AuditRepository } from '../repositories/audit.repository.js';

const auditRepo = new AuditRepository(db);

// ──────────────── CRUD ────────────────

export async function createSupplier(
  tenantId: string,
  userId: string,
  data: {
    name: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    gstin?: string | null;
    pan?: string | null;
    bankDetails?: Record<string, unknown> | null;
    paymentTerms?: string;
  },
) {
  const [supplier] = await db
    .insert(suppliers)
    .values({
      tenantId,
      name: data.name,
      contactPerson: data.contactPerson ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      gstin: data.gstin ?? null,
      pan: data.pan ?? null,
      bankDetails: data.bankDetails ?? null,
      paymentTerms: data.paymentTerms ?? 'cod',
    })
    .returning();

  await auditRepo.log({
    tenantId,
    userId,
    action: 'supplier_created',
    entityType: 'supplier',
    entityId: supplier.id,
    newValue: { name: data.name },
  });

  return supplier;
}

export async function listSuppliers(
  tenantId: string,
  opts?: { search?: string; isActive?: boolean; page?: number; limit?: number },
) {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [eq(suppliers.tenantId, tenantId), isNull(suppliers.deletedAt)];

  if (opts?.search) {
    conditions.push(
      or(
        ilike(suppliers.name, `%${opts.search}%`),
        ilike(suppliers.phone, `%${opts.search}%`),
        ilike(suppliers.contactPerson, `%${opts.search}%`),
      )!,
    );
  }

  if (opts?.isActive !== undefined) {
    conditions.push(eq(suppliers.isActive, opts.isActive));
  }

  const where = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db.select().from(suppliers).where(where).orderBy(asc(suppliers.name)).limit(limit).offset(offset),
    db.select({ total: count() }).from(suppliers).where(where),
  ]);

  return { data, total: totalResult[0]?.total ?? 0, page, limit };
}

export async function getSupplierById(tenantId: string, supplierId: string) {
  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.tenantId, tenantId), isNull(suppliers.deletedAt)));

  if (!supplier) throw new AppError('NOT_FOUND', 'Supplier not found', 404);
  return supplier;
}

export async function updateSupplier(
  tenantId: string,
  supplierId: string,
  userId: string,
  data: Record<string, unknown>,
) {
  const [updated] = await db
    .update(suppliers)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(eq(suppliers.id, supplierId), eq(suppliers.tenantId, tenantId), isNull(suppliers.deletedAt)),
    )
    .returning();

  if (!updated) throw new AppError('NOT_FOUND', 'Supplier not found', 404);

  await auditRepo.log({
    tenantId,
    userId,
    action: 'supplier_updated',
    entityType: 'supplier',
    entityId: supplierId,
    newValue: data,
  });

  return updated;
}

export async function deactivateSupplier(tenantId: string, supplierId: string, userId: string) {
  const [updated] = await db
    .update(suppliers)
    .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
    .where(
      and(eq(suppliers.id, supplierId), eq(suppliers.tenantId, tenantId), isNull(suppliers.deletedAt)),
    )
    .returning({ id: suppliers.id });

  if (!updated) throw new AppError('NOT_FOUND', 'Supplier not found', 404);

  await auditRepo.log({
    tenantId,
    userId,
    action: 'supplier_deactivated',
    entityType: 'supplier',
    entityId: supplierId,
  });
}

// ──────────────── Ledger ────────────────

export async function getSupplierLedger(
  tenantId: string,
  supplierId: string,
  opts?: { page?: number; limit?: number },
) {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 50;
  const offset = (page - 1) * limit;

  const where = and(
    eq(supplierTransactions.tenantId, tenantId),
    eq(supplierTransactions.supplierId, supplierId),
  );

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(supplierTransactions)
      .where(where)
      .orderBy(desc(supplierTransactions.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(supplierTransactions).where(where),
  ]);

  return { data, total: totalResult[0]?.total ?? 0, page, limit };
}

// ──────────────── Payment Recording ────────────────

export async function recordPayment(
  tenantId: string,
  supplierId: string,
  userId: string,
  data: { amount: number; paymentMode: string; notes?: string },
) {
  return db.transaction(async (tx) => {
    // Fetch supplier
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(
        and(eq(suppliers.id, supplierId), eq(suppliers.tenantId, tenantId), isNull(suppliers.deletedAt)),
      );

    if (!supplier) throw new AppError('NOT_FOUND', 'Supplier not found', 404);

    // Calculate new balance (payment reduces what we owe)
    const currentBalance = Number(supplier.outstandingBalance);
    const newBalance = currentBalance - data.amount;

    // Update supplier balance
    await tx
      .update(suppliers)
      .set({
        outstandingBalance: String(newBalance),
        updatedAt: new Date(),
      })
      .where(eq(suppliers.id, supplierId));

    // Create transaction record
    const [transaction] = await tx
      .insert(supplierTransactions)
      .values({
        tenantId,
        supplierId,
        type: 'payment',
        amount: String(-data.amount), // Negative = we owe less
        balanceAfter: String(newBalance),
        referenceType: 'payment',
        paymentMode: data.paymentMode,
        notes: data.notes ?? null,
        createdBy: userId,
      })
      .returning();

    // Audit log
    await auditRepo.withTransaction(tx).log({
      tenantId,
      userId,
      action: 'supplier_payment_recorded',
      entityType: 'supplier',
      entityId: supplierId,
      newValue: {
        amount: data.amount,
        paymentMode: data.paymentMode,
        previousBalance: currentBalance,
        newBalance,
      },
    });

    return {
      transactionId: transaction.id,
      supplierId,
      amount: data.amount,
      paymentMode: data.paymentMode,
      previousBalance: currentBalance,
      newBalance,
    };
  });
}

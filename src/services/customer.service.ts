import { eq, and, or, ilike, isNull, asc, desc, count, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { customers, customerTransactions } from '../db/schema/customers.js';
import { AppError } from '../types/errors.js';
import { AuditRepository } from '../repositories/audit.repository.js';

const auditRepo = new AuditRepository(db);

// ──────────────── CRUD ────────────────

export async function createCustomer(
  tenantId: string,
  userId: string,
  data: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    notes?: string;
    gstin?: string;
    clientId?: string;
  },
) {
  // Check client_id idempotency (offline sync)
  if (data.clientId) {
    const [existing] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.clientId, data.clientId)));
    if (existing) return existing;
  }

  // Check phone uniqueness
  const [existingPhone] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(eq(customers.tenantId, tenantId), eq(customers.phone, data.phone), isNull(customers.deletedAt)),
    );
  if (existingPhone) {
    throw new AppError('CONFLICT', `Customer with phone ${data.phone} already exists`, 409);
  }

  const [customer] = await db
    .insert(customers)
    .values({
      tenantId,
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      gstin: data.gstin ?? null,
      clientId: data.clientId ?? null,
    })
    .returning();

  await auditRepo.log({
    tenantId,
    userId,
    action: 'customer_created',
    entityType: 'customer',
    entityId: customer.id,
    newValue: { name: data.name, phone: data.phone },
  });

  return customer;
}

export async function listCustomers(
  tenantId: string,
  opts?: { search?: string; page?: number; limit?: number },
) {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [eq(customers.tenantId, tenantId), isNull(customers.deletedAt)];

  if (opts?.search) {
    conditions.push(
      or(
        ilike(customers.name, `%${opts.search}%`),
        ilike(customers.phone, `%${opts.search}%`),
      )!,
    );
  }

  const where = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db.select().from(customers).where(where).orderBy(asc(customers.name)).limit(limit).offset(offset),
    db.select({ total: count() }).from(customers).where(where),
  ]);

  return { data, total: totalResult[0]?.total ?? 0, page, limit };
}

export async function getCustomerById(tenantId: string, customerId: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId), isNull(customers.deletedAt)));

  if (!customer) throw new AppError('NOT_FOUND', 'Customer not found', 404);
  return customer;
}

export async function updateCustomer(
  tenantId: string,
  customerId: string,
  userId: string,
  data: Record<string, unknown>,
) {
  // If changing phone, check uniqueness
  if (data.phone) {
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.tenantId, tenantId),
          eq(customers.phone, data.phone as string),
          isNull(customers.deletedAt),
          sql`${customers.id} != ${customerId}`,
        ),
      );
    if (existing) {
      throw new AppError('CONFLICT', `Phone ${data.phone} is already used by another customer`, 409);
    }
  }

  const [updated] = await db
    .update(customers)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(eq(customers.id, customerId), eq(customers.tenantId, tenantId), isNull(customers.deletedAt)),
    )
    .returning();

  if (!updated) throw new AppError('NOT_FOUND', 'Customer not found', 404);

  await auditRepo.log({
    tenantId,
    userId,
    action: 'customer_updated',
    entityType: 'customer',
    entityId: customerId,
    newValue: data,
  });

  return updated;
}

// ──────────────── Lookup Helpers (POS + Offline Sync) ────────────────

export async function findByPhone(tenantId: string, phone: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(
      and(eq(customers.tenantId, tenantId), eq(customers.phone, phone), isNull(customers.deletedAt)),
    );
  return customer ?? null;
}

export async function findByClientId(tenantId: string, clientId: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.clientId, clientId)));
  return customer ?? null;
}

// ──────────────── Stats Update (called after each sale) ────────────────

export async function updateStats(
  tenantId: string,
  customerId: string,
  saleAmount: number,
  tx?: typeof db,
) {
  const database = tx ?? db;
  await database
    .update(customers)
    .set({
      totalSpend: sql`${customers.totalSpend}::numeric + ${saleAmount}`,
      visitCount: sql`${customers.visitCount} + 1`,
      lastVisitAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)));
}

// ──────────────── Ledger ────────────────

export async function getCustomerLedger(
  tenantId: string,
  customerId: string,
  opts?: { page?: number; limit?: number },
) {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 50;
  const offset = (page - 1) * limit;

  const where = and(
    eq(customerTransactions.tenantId, tenantId),
    eq(customerTransactions.customerId, customerId),
  );

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(customerTransactions)
      .where(where)
      .orderBy(desc(customerTransactions.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(customerTransactions).where(where),
  ]);

  return { data, total: totalResult[0]?.total ?? 0, page, limit };
}

// ──────────────── Payment Recording ────────────────

export async function recordPayment(
  tenantId: string,
  customerId: string,
  userId: string,
  data: { amount: number; paymentMode: string; notes?: string },
) {
  return db.transaction(async (tx) => {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(
        and(eq(customers.id, customerId), eq(customers.tenantId, tenantId), isNull(customers.deletedAt)),
      );

    if (!customer) throw new AppError('NOT_FOUND', 'Customer not found', 404);

    // Payment reduces what they owe
    const currentBalance = Number(customer.outstandingBalance);
    const newBalance = currentBalance - data.amount;

    await tx
      .update(customers)
      .set({ outstandingBalance: String(newBalance), updatedAt: new Date() })
      .where(eq(customers.id, customerId));

    const [transaction] = await tx
      .insert(customerTransactions)
      .values({
        tenantId,
        customerId,
        type: 'payment',
        amount: String(-data.amount), // Negative = they owe less
        balanceAfter: String(newBalance),
        referenceType: 'payment',
        paymentMode: data.paymentMode,
        notes: data.notes ?? null,
        createdBy: userId,
      })
      .returning();

    await auditRepo.withTransaction(tx).log({
      tenantId,
      userId,
      action: 'customer_payment_recorded',
      entityType: 'customer',
      entityId: customerId,
      newValue: {
        amount: data.amount,
        paymentMode: data.paymentMode,
        previousBalance: currentBalance,
        newBalance,
      },
    });

    return {
      transactionId: transaction.id,
      customerId,
      amount: data.amount,
      paymentMode: data.paymentMode,
      previousBalance: currentBalance,
      newBalance,
    };
  });
}

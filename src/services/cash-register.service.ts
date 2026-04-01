import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { cashRegisters, cashRegisterEntries } from '../db/schema/cash-registers.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { Decimal } from '../lib/money.js';

export async function openRegister(tenantId: string, userId: string, openingBalance: number) {
  // Check if already open
  const [existing] = await db.select({ id: cashRegisters.id })
    .from(cashRegisters)
    .where(and(
      eq(cashRegisters.tenantId, tenantId),
      eq(cashRegisters.userId, userId),
      eq(cashRegisters.status, 'open')
    ))
    .limit(1);

  if (existing) {
    throw new ValidationError('You already have an open cash register. Close it before opening a new one.');
  }

  const today = new Date().toISOString().split('T')[0];

  const [register] = await db.insert(cashRegisters).values({
    tenantId,
    userId,
    registerDate: today,
    openingBalance: String(openingBalance),
    status: 'open',
  }).returning();

  return register;
}

export async function getCurrentRegister(tenantId: string, userId: string) {
  const [register] = await db.select()
    .from(cashRegisters)
    .where(and(
      eq(cashRegisters.tenantId, tenantId),
      eq(cashRegisters.userId, userId),
      eq(cashRegisters.status, 'open')
    ))
    .limit(1);

  if (!register) return null;

  // Get entries and calculate current balance
  const entries = await db.select()
    .from(cashRegisterEntries)
    .where(eq(cashRegisterEntries.registerId, register.id))
    .orderBy(desc(cashRegisterEntries.createdAt));

  const totalEntries = entries.reduce((sum, e) => sum + Number(e.amount), 0);
  const currentBalance = new Decimal(register.openingBalance).plus(totalEntries).toDecimalPlaces(2).toNumber();

  return { ...register, entries, currentBalance };
}

export async function getRegisterById(tenantId: string, registerId: string) {
  const [register] = await db.select()
    .from(cashRegisters)
    .where(and(eq(cashRegisters.id, registerId), eq(cashRegisters.tenantId, tenantId)))
    .limit(1);

  if (!register) throw new NotFoundError('CashRegister', registerId);

  const entries = await db.select()
    .from(cashRegisterEntries)
    .where(eq(cashRegisterEntries.registerId, registerId))
    .orderBy(desc(cashRegisterEntries.createdAt));

  return { ...register, entries };
}

export async function closeRegister(tenantId: string, userId: string, registerId: string, actualClosing: number) {
  const [register] = await db.select()
    .from(cashRegisters)
    .where(and(
      eq(cashRegisters.id, registerId),
      eq(cashRegisters.tenantId, tenantId),
      eq(cashRegisters.userId, userId),
      eq(cashRegisters.status, 'open')
    ))
    .limit(1);

  if (!register) throw new NotFoundError('Open CashRegister', registerId);

  // Calculate expected closing
  const [{ total }] = await db.execute(
    sql`SELECT COALESCE(SUM(CAST(amount AS numeric)), 0) AS total FROM cash_register_entries WHERE register_id = ${registerId}`
  ) as any;

  const calculatedClosing = new Decimal(register.openingBalance).plus(total).toDecimalPlaces(2).toNumber();
  const discrepancy = new Decimal(actualClosing).minus(calculatedClosing).toDecimalPlaces(2).toNumber();

  const [updated] = await db.update(cashRegisters).set({
    calculatedClosing: String(calculatedClosing),
    actualClosing: String(actualClosing),
    discrepancy: String(discrepancy),
    status: 'closed',
  }).where(eq(cashRegisters.id, registerId)).returning();

  return updated;
}

export async function getRegisterHistory(tenantId: string, userId: string, limit = 20, offset = 0) {
  const registers = await db.select()
    .from(cashRegisters)
    .where(and(eq(cashRegisters.tenantId, tenantId), eq(cashRegisters.userId, userId)))
    .orderBy(desc(cashRegisters.registerDate))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = registers.length > limit;
  if (hasMore) registers.pop();

  return { registers, hasMore };
}

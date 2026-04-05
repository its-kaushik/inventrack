import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cashRegisters } from '../db/schema/cash-register.js';
import { AppError } from '../types/errors.js';
import { AuditRepository } from '../repositories/audit.repository.js';

const auditRepo = new AuditRepository(db);

function todayDateStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function openRegister(
  tenantId: string,
  userId: string,
  openingBalance: number,
) {
  const today = todayDateStr();

  // Check if register already open for today
  const [existing] = await db
    .select()
    .from(cashRegisters)
    .where(and(eq(cashRegisters.tenantId, tenantId), eq(cashRegisters.date, today)));

  if (existing) {
    throw new AppError('CONFLICT', 'Cash register already opened for today', 409);
  }

  const [register] = await db
    .insert(cashRegisters)
    .values({
      tenantId,
      date: today,
      openingBalance: String(openingBalance),
      status: 'open',
      openedBy: userId,
    })
    .returning();

  await auditRepo.log({
    tenantId,
    userId,
    action: 'cash_register_opened',
    entityType: 'cash_register',
    entityId: register.id,
    newValue: { date: today, openingBalance },
  });

  return register;
}

export async function closeRegister(
  tenantId: string,
  userId: string,
  actualClosing: number,
) {
  const today = todayDateStr();

  const [register] = await db
    .select()
    .from(cashRegisters)
    .where(
      and(
        eq(cashRegisters.tenantId, tenantId),
        eq(cashRegisters.date, today),
        eq(cashRegisters.status, 'open'),
      ),
    );

  if (!register) {
    throw new AppError('NOT_FOUND', 'No open cash register for today', 404);
  }

  // For now, closing balance = opening balance (actual cash tracking from sales/expenses
  // will be integrated when reports are built in M18)
  const closingBalance = Number(register.openingBalance); // Placeholder
  const discrepancy = actualClosing - closingBalance;

  const [closed] = await db
    .update(cashRegisters)
    .set({
      closingBalance: String(closingBalance),
      actualClosing: String(actualClosing),
      discrepancy: String(discrepancy),
      status: 'closed',
      closedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(cashRegisters.id, register.id))
    .returning();

  await auditRepo.log({
    tenantId,
    userId,
    action: 'cash_register_closed',
    entityType: 'cash_register',
    entityId: register.id,
    newValue: { actualClosing, closingBalance, discrepancy },
  });

  return closed;
}

export async function getCurrentRegister(tenantId: string) {
  const today = todayDateStr();

  const [register] = await db
    .select()
    .from(cashRegisters)
    .where(and(eq(cashRegisters.tenantId, tenantId), eq(cashRegisters.date, today)));

  return register ?? null;
}

export async function getRegisterByDate(tenantId: string, date: string) {
  const [register] = await db
    .select()
    .from(cashRegisters)
    .where(and(eq(cashRegisters.tenantId, tenantId), eq(cashRegisters.date, date)));

  if (!register) throw new AppError('NOT_FOUND', `No register found for ${date}`, 404);
  return register;
}

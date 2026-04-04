import { eq, and, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { labelTemplates } from '../db/schema/label-templates.js';
import { NotFoundError } from '../lib/errors.js';

const BUILT_IN_TEMPLATES = [
  {
    id: 'default',
    name: 'Standard Label (A4 3x10)',
    description: 'Barcode + Name + Size + Price on A4 sheet',
    fields: ['barcode', 'name', 'size', 'price', 'sku'],
    layout: { columns: 3, labelWidth: '63mm', labelHeight: '25mm' },
    isDefault: true,
    builtIn: true,
  },
  {
    id: 'minimal',
    name: 'Minimal Label',
    description: 'Barcode + Price only',
    fields: ['barcode', 'price'],
    layout: { columns: 3, labelWidth: '63mm', labelHeight: '20mm' },
    isDefault: false,
    builtIn: true,
  },
  {
    id: 'thermal',
    name: 'Thermal (50x25mm)',
    description: 'Single label for thermal printer',
    fields: ['barcode', 'name', 'size', 'price'],
    layout: { columns: 1, labelWidth: '50mm', labelHeight: '25mm' },
    isDefault: false,
    builtIn: true,
  },
];

export async function listTemplates(tenantId: string) {
  const custom = await db
    .select()
    .from(labelTemplates)
    .where(eq(labelTemplates.tenantId, tenantId))
    .orderBy(desc(labelTemplates.createdAt));

  return [...BUILT_IN_TEMPLATES, ...custom.map((t) => ({ ...t, builtIn: false }))];
}

export async function createTemplate(
  tenantId: string,
  input: { name: string; description?: string; fields: string[]; layout?: Record<string, unknown> },
) {
  const [template] = await db
    .insert(labelTemplates)
    .values({
      tenantId,
      name: input.name,
      description: input.description,
      fields: input.fields,
      layout: input.layout ?? { columns: 3, labelWidth: '63mm', labelHeight: '25mm' },
    })
    .returning();

  return { ...template, builtIn: false };
}

export async function updateTemplate(
  tenantId: string,
  templateId: string,
  patch: {
    name?: string;
    description?: string;
    fields?: string[];
    layout?: Record<string, unknown>;
  },
) {
  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.fields !== undefined) updates.fields = patch.fields;
  if (patch.layout !== undefined) updates.layout = patch.layout;

  const [updated] = await db
    .update(labelTemplates)
    .set(updates)
    .where(and(eq(labelTemplates.id, templateId), eq(labelTemplates.tenantId, tenantId)))
    .returning();

  if (!updated) throw new NotFoundError('Label template', templateId);
  return { ...updated, builtIn: false };
}

export function getCurrentFinancialYear(fyStartMonth = 4): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (month >= fyStartMonth) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

export function getFinancialYearShort(fy: string): string {
  return fy.split('-')[0];
}

export function getQuarter(fyStartMonth = 4): { quarter: number; label: string } {
  const now = new Date();
  const month = now.getMonth() + 1;

  const fyMonth = ((month - fyStartMonth + 12) % 12) + 1;
  const quarter = Math.ceil(fyMonth / 3);

  return { quarter, label: `Q${quarter}` };
}

export function formatDateIST(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

/**
 * Simple CSV parser for migration imports.
 * Handles comma-separated values with optional quoting.
 */
export function parseCsv(
  content: string,
  requiredColumns: string[],
): { headers: string[]; rows: Record<string, string>[]; errors: string[] } {
  const lines = content.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const errors: string[] = [];

  if (lines.length < 2) {
    return { headers: [], rows: [], errors: ['CSV must have a header row and at least one data row'] };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

  // Validate required columns exist
  for (const col of requiredColumns) {
    if (!headers.includes(col.toLowerCase())) {
      errors.push(`Missing required column: ${col}`);
    }
  }

  if (errors.length > 0) {
    return { headers, rows: [], errors };
  }

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? '').trim();
    }
    rows.push(row);
  }

  return { headers, rows, errors };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

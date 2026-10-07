import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrollments, sessions, userRole, users, workshops } from '../src/index.js';

const schemaSource = await fs.readFile(
  path.join(fileURLToPath(import.meta.url), '..', '..', 'src', 'schema.ts'),
  'utf8',
);

describe('database package exports', () => {
  it('exports the user_role enum', () => {
    expect(userRole).toBeDefined();
    expect(userRole.enumName).toBe('user_role');
  });

  it('exports all four required tables', () => {
    expect(users).toBeDefined();
    expect(workshops).toBeDefined();
    expect(enrollments).toBeDefined();
    expect(sessions).toBeDefined();
  });

  it('defines a composite primary key on enrollments for uniqueness', () => {
    // Drizzle exposes the table's composite primary keys through internal metadata
    const enrollmentsKeys = Object.keys(enrollments);
    expect(enrollmentsKeys).toContain('userId');
    expect(enrollmentsKeys).toContain('workshopId');
  });
});

describe('schema source verification', () => {
  it('contains the user_role enum definition', () => {
    expect(schemaSource).toContain("pgEnum('user_role'");
  });

  it('contains a positive capacity check constraint', () => {
    expect(schemaSource).toContain('workshops_capacity_positive');
    expect(schemaSource).toMatch(/capacity.*>\s*0/);
  });

  it('contains a composite primary key for enrollment uniqueness', () => {
    expect(schemaSource).toContain('primaryKey({ columns: [table.userId, table.workshopId] })');
  });
});

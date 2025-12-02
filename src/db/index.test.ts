import { describe, test, expect, beforeAll } from 'bun:test';
import { checkDatabaseConnection } from './index';

describe('Database Connection', () => {
  beforeAll(() => {
    // Ensure DATABASE_URL is set for tests
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
    }
  });

  test('should export db instance', async () => {
    const { db } = await import('./index');
    expect(db).toBeDefined();
  });

  test('should have checkDatabaseConnection function', () => {
    expect(checkDatabaseConnection).toBeDefined();
    expect(typeof checkDatabaseConnection).toBe('function');
  });

  test('checkDatabaseConnection should return boolean', async () => {
    // This test will fail if no actual database is available, which is expected
    // In a real environment with a database, it should return true
    const result = await checkDatabaseConnection();
    expect(typeof result).toBe('boolean');
  });
});

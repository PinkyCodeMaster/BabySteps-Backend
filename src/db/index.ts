import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { logger } from '../lib/logger';

// Get database URL from environment
// Note: This will be validated by config module on server startup
const databaseUrl = process.env["DATABASE_URL"]!;

// Create Neon HTTP client
const sql = neon(databaseUrl);

// Create Drizzle instance
export const db = drizzle(sql);

// Health check function to verify database connection
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    // Simple query to test connection
    await sql`SELECT 1 as health_check`;
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Database connection failed');
    return false;
  }
}

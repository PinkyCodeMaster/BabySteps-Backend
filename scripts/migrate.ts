#!/usr/bin/env bun
/**
 * Database Migration Script
 * 
 * Runs Drizzle migrations programmatically without requiring drizzle-kit CLI.
 * This is used in production Docker containers where drizzle-kit is not installed.
 */

import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

// Load environment variables
config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

async function runMigrations() {
  console.log('🔄 Starting database migrations...');
  console.log(`📍 Database: ${DATABASE_URL.split('@')[1]?.split('?')[0] || 'unknown'}`);

  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  try {
    // Run migrations from the drizzle folder
    await migrate(db, { migrationsFolder: './drizzle' });
    
    console.log('✅ Migrations completed successfully');
    process.exit(0);
  } catch (error: any) {
    // Check if error is due to migrations already being applied
    const errorMessage = error?.message || String(error);
    const cause = error?.cause;
    const causeCode = cause?.code;
    const causeMessage = cause?.message || '';
    
    if (errorMessage.includes('already exists') || 
        errorMessage.includes('duplicate') ||
        causeMessage.includes('already exists') ||
        error?.code === '42710' || // PostgreSQL: duplicate object
        error?.code === '42P07' || // PostgreSQL: duplicate table
        causeCode === '42710' ||
        causeCode === '42P07') {
      console.log('ℹ️  Database schema is already up to date');
      process.exit(0);
    }
    
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();

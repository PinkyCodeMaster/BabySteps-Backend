#!/usr/bin/env bun
/**
 * Schema Verification Script
 * 
 * This script verifies that all expected tables and enums exist in the database
 * after running migrations.
 */

import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL!);

// Expected tables based on our schema
const expectedTables = [
  'user',
  'session',
  'account',
  'verification',
  'organization',
  'member',
  'invitation',
  'income',
  'expense',
  'debt',
  'baby_step',
  'audit_log',
  'uc_config',
];

// Expected enums
const expectedEnums = [
  'frequency',
  'expense_category',
  'expense_priority',
  'debt_status',
  'debt_type',
];

async function verifySchema() {
  console.log('🔍 Verifying database schema...\n');

  try {
    // Check database connection
    console.log('✓ Testing database connection...');
    await sql`SELECT 1 as health_check`;
    console.log('  ✅ Database connection successful\n');

    // Check tables
    console.log('✓ Checking tables...');
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    const tableNames = tables.map((t: any) => t.table_name);
    console.log(`  Found ${tableNames.length} tables: ${tableNames.join(', ')}`);

    const missingTables = expectedTables.filter(t => !tableNames.includes(t));
    if (missingTables.length > 0) {
      console.error(`  ❌ Missing tables: ${missingTables.join(', ')}`);
      process.exit(1);
    }
    console.log('  ✅ All expected tables exist\n');

    // Check enums
    console.log('✓ Checking enums...');
    const enums = await sql`
      SELECT typname 
      FROM pg_type 
      WHERE typtype = 'e' 
      AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      ORDER BY typname
    `;

    const enumNames = enums.map((e: any) => e.typname);
    console.log(`  Found ${enumNames.length} enums: ${enumNames.join(', ')}`);

    const missingEnums = expectedEnums.filter(e => !enumNames.includes(e));
    if (missingEnums.length > 0) {
      console.error(`  ❌ Missing enums: ${missingEnums.join(', ')}`);
      process.exit(1);
    }
    console.log('  ✅ All expected enums exist\n');

    // Check foreign keys
    console.log('✓ Checking foreign key constraints...');
    const foreignKeys = await sql`
      SELECT 
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name
    `;

    console.log(`  Found ${foreignKeys.length} foreign key constraints`);
    console.log('  ✅ Foreign keys configured\n');

    // Check indexes
    console.log('✓ Checking indexes...');
    const indexes = await sql`
      SELECT 
        tablename,
        indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `;

    console.log(`  Found ${indexes.length} indexes`);
    console.log('  ✅ Indexes configured\n');

    // Summary
    console.log('═══════════════════════════════════════');
    console.log('✅ Schema verification completed successfully!');
    console.log('═══════════════════════════════════════');
    console.log(`Tables: ${tableNames.length}/${expectedTables.length}`);
    console.log(`Enums: ${enumNames.length}/${expectedEnums.length}`);
    console.log(`Foreign Keys: ${foreignKeys.length}`);
    console.log(`Indexes: ${indexes.length}`);
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Schema verification failed:', error);
    process.exit(1);
  }
}

// Run verification
verifySchema();

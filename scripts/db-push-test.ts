#!/usr/bin/env bun
/**
 * Push database schema to test database
 * 
 * This script:
 * 1. Loads DATABASE_URL from .env.test.local (or falls back to .env.test)
 * 2. Runs drizzle-kit push to apply schema changes
 * 
 * Usage: bun run db:push:test
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { $ } from 'bun';

// Try .env.test.local first (with credentials), fall back to .env.test (template)
const envTestLocalPath = join(process.cwd(), '.env.test.local');
const envTestPath = join(process.cwd(), '.env.test');

let envFilePath: string;
if (existsSync(envTestLocalPath)) {
  envFilePath = envTestLocalPath;
  console.log('📄 Using .env.test.local');
} else if (existsSync(envTestPath)) {
  envFilePath = envTestPath;
  console.log('📄 Using .env.test (consider creating .env.test.local for credentials)');
} else {
  console.error('❌ Error: Neither .env.test.local nor .env.test file found!');
  console.error('Please create .env.test.local with your test database URL.');
  console.error('See TESTING_SETUP.md for instructions.');
  process.exit(1);
}

// Parse env file
const envContent = readFileSync(envFilePath, 'utf-8');
const lines = envContent.split('\n');
let testDatabaseUrl: string | null = null;

for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('DATABASE_URL=')) {
    // Extract value, handling quotes
    testDatabaseUrl = trimmed
      .substring('DATABASE_URL='.length)
      .replace(/^['"]|['"]$/g, '');
    break;
  }
}

if (!testDatabaseUrl) {
  console.error('❌ Error: DATABASE_URL not found in test environment file');
  console.error('Please add DATABASE_URL to your .env.test.local file.');
  process.exit(1);
}

// Check for placeholder/template values
if (!testDatabaseUrl || 
    testDatabaseUrl.includes('user:pass@') ||
    testDatabaseUrl.includes('test-branch-xxx') ||
    testDatabaseUrl.includes('ep-test-branch-xxx')) {
  console.error('⚠️  Warning: You are using a placeholder/template test database URL!');
  console.error('Please update DATABASE_URL in .env.test.local with your actual test database.');
  console.error('See TESTING_SETUP.md for instructions.');
  process.exit(1);
}

console.log('🔧 Pushing schema to test database...');
console.log(`📍 Database: ${testDatabaseUrl.split('@')[1]?.split('?')[0] || 'test database'}`);

try {
  // Set DATABASE_URL environment variable and run drizzle-kit push
  await $`DATABASE_URL=${testDatabaseUrl} drizzle-kit push`.env({
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
  });
  
  console.log('✅ Schema successfully pushed to test database!');
  console.log('🧪 You can now run tests with: bun test');
} catch (error) {
  console.error('❌ Failed to push schema to test database');
  console.error(error);
  process.exit(1);
}

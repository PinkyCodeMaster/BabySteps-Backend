/**
 * Load test environment variables from .env.test.local (or .env.test)
 * 
 * This script is imported by tests to ensure test environment is loaded
 * before any database connections are made.
 * 
 * Priority: .env.test.local > .env.test
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Try .env.test.local first (with credentials), fall back to .env.test (template)
const envTestLocalPath = join(process.cwd(), '.env.test.local');
const envTestPath = join(process.cwd(), '.env.test');

let envFilePath: string | null = null;
if (existsSync(envTestLocalPath)) {
  envFilePath = envTestLocalPath;
} else if (existsSync(envTestPath)) {
  envFilePath = envTestPath;
}

if (envFilePath) {
  const envContent = readFileSync(envFilePath, 'utf-8');
  const lines = envContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      
      // Remove quotes if present
      value = value.replace(/^['"]|['"]$/g, '');
      
      // Only set if not already set (don't override existing env vars)
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
  
  const fileName = envFilePath.includes('.local') ? '.env.test.local' : '.env.test';
  console.log(`✅ Loaded test environment from ${fileName}`);
} else {
  console.warn('⚠️  Warning: Neither .env.test.local nor .env.test found, using current environment');
}

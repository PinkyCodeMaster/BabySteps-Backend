import { z } from 'zod';

/**
 * Environment configuration schema
 * Validates all required environment variables on startup
 */
const envSchema = z.object({
  // Database Configuration
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL').min(1, 'DATABASE_URL is required'),

  // Better Auth Configuration
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters for security'),
  BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL must be a valid URL').default('http://localhost:9000'),

  // CORS Configuration
  ALLOWED_ORIGINS: z.string().min(1, 'ALLOWED_ORIGINS is required (comma-separated list)'),

  // Server Configuration
  PORT: z.string().regex(/^\d+$/, 'PORT must be a number').default('9000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Logging Configuration
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Optional: Sentry Error Tracking
  SENTRY_DSN: z.string().url('SENTRY_DSN must be a valid URL').optional(),

  // Optional: Redis for Caching
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL').optional(),
});

/**
 * Environment configuration interface
 * Inferred from Zod schema for type safety
 */
export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validated environment configuration
 * Populated after validateEnv() is called
 */
let config: EnvConfig | null = null;

/**
 * Validate environment variables on startup
 * Fails fast if configuration is invalid
 * 
 * @throws {Error} If validation fails with detailed error messages
 */
export function validateEnv(): EnvConfig {
  try {
    // Parse and validate environment variables
    config = envSchema.parse(process.env);
    
    console.log('✅ Environment configuration validated successfully');
    console.log(`   - Environment: ${config.NODE_ENV}`);
    console.log(`   - Port: ${config.PORT}`);
    console.log(`   - Database: ${config.DATABASE_URL.split('@')[1] || 'configured'}`);
    console.log(`   - Auth URL: ${config.BETTER_AUTH_URL}`);
    console.log(`   - CORS Origins: ${config.ALLOWED_ORIGINS.split(',').length} origin(s)`);
    console.log(`   - Log Level: ${config.LOG_LEVEL}`);
    
    if (config.SENTRY_DSN) {
      console.log('   - Sentry: enabled');
    }
    
    if (config.REDIS_URL) {
      console.log('   - Redis: enabled');
    }
    
    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment configuration validation failed:');
      console.error('');
      
      // Format validation errors for readability
      error.issues.forEach((err) => {
        const path = err.path.join('.');
        console.error(`   - ${path}: ${err.message}`);
      });
      
      console.error('');
      console.error('Please check your .env file and ensure all required variables are set correctly.');
      console.error('See .env.example for reference.');
      
      // Exit process with error code
      process.exit(1);
    }
    
    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Get validated environment configuration
 * Must call validateEnv() first
 * 
 * @throws {Error} If validateEnv() has not been called
 */
export function getConfig(): EnvConfig {
  if (!config) {
    throw new Error('Environment configuration not initialized. Call validateEnv() first.');
  }
  
  return config;
}

/**
 * Helper function to check if running in production
 */
export function isProduction(): boolean {
  return getConfig().NODE_ENV === 'production';
}

/**
 * Helper function to check if running in development
 */
export function isDevelopment(): boolean {
  return getConfig().NODE_ENV === 'development';
}

/**
 * Helper function to check if running in test
 */
export function isTest(): boolean {
  return getConfig().NODE_ENV === 'test';
}

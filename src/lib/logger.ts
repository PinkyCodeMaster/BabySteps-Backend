import pino from 'pino';

/**
 * Log levels by environment
 */
const LOG_LEVELS = {
  development: 'debug',
  test: 'silent',
  staging: 'info',
  production: 'warn',
} as const;

/**
 * Get log level from environment
 */
function getLogLevel(): pino.Level {
  const envLevel = process.env['LOG_LEVEL'];
  if (envLevel && ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'].includes(envLevel)) {
    return envLevel as pino.Level;
  }
  
  const env = process.env['NODE_ENV'] || 'development';
  return LOG_LEVELS[env as keyof typeof LOG_LEVELS] || 'info';
}

/**
 * Determine if we should use pretty printing
 */
function shouldUsePrettyPrint(): boolean {
  const env = process.env['NODE_ENV'] || 'development';
  return env === 'development' && !process.env['CI'];
}

/**
 * Create Pino logger instance with environment-specific configuration
 */
export const logger = pino({
  level: getLogLevel(),
  
  // Base configuration
  base: {
    env: process.env['NODE_ENV'] || 'development',
    service: 'debt-snowball-api',
  },
  
  // Timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,
  
  // Pretty printing for development
  transport: shouldUsePrettyPrint()
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined,
  
  // Redact sensitive fields
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'sessionToken',
      'authorization',
      'cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
    remove: true,
  },
  
  // Serializers for common objects
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Log levels for convenience
 */
export const LogLevel = {
  TRACE: 'trace',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

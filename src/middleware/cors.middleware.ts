import { cors } from 'hono/cors';

/**
 * Parse ALLOWED_ORIGINS from environment variable
 * Supports comma-separated list of origins
 */
function getAllowedOrigins(): string[] {
  const originsEnv = process.env['ALLOWED_ORIGINS'] || '';
  
  if (!originsEnv) {
    console.warn('⚠️  ALLOWED_ORIGINS not set, defaulting to localhost:3000');
    return ['http://localhost:3000'];
  }
  
  return originsEnv
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
}

/**
 * CORS middleware with strict origin checking
 * Validates requests against ALLOWED_ORIGINS environment variable
 * 
 * Requirements: 10.2, 10.3
 * - Property 52: CORS allows approved domains
 * - Property 53: CORS rejects unapproved domains
 */
export const corsMiddleware = () => {
  const allowedOrigins = getAllowedOrigins();
  
  console.log('🔒 CORS configured with allowed origins:', allowedOrigins);
  
  return cors({
    origin: (origin) => {
      // Allow requests with no origin (e.g., mobile apps, Postman)
      if (!origin) {
        return null;
      }
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return origin;
      }
      
      // Reject unapproved origins
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 600, // 10 minutes
    credentials: true,
  });
};

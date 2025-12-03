/**
 * Common Zod Schemas
 * 
 * Reusable schema definitions for OpenAPI routes to reduce duplication.
 */

import { z } from "zod";

/**
 * Organization ID parameter schema
 */
export const OrgIdParamSchema = z.object({
  orgId: z.string().openapi({ example: 'org_123' }),
});

/**
 * Resource ID parameter schema (with orgId)
 */
export const ResourceIdParamSchema = z.object({
  orgId: z.string().openapi({ example: 'org_123' }),
  id: z.string().openapi({ example: 'resource_456' }),
});

/**
 * Common list query parameters
 */
export const ListQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1).openapi({ example: '1' }),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50).openapi({ example: '50' }),
  sortBy: z.enum(["createdAt", "name", "amount"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

/**
 * Common pagination response schema
 */
export const PaginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
});

/**
 * Common error response schema
 */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
});

/**
 * Common delete response schema
 */
export const DeleteResponseSchema = z.object({
  message: z.string(),
});

/**
 * Frequency enum schema
 */
export const FrequencySchema = z.enum(['one-time', 'weekly', 'fortnightly', 'monthly', 'annual']);

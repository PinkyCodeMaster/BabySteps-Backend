/**
 * Router Helper Utilities
 * 
 * Common utilities for route handlers to reduce code duplication.
 * Provides organization access verification and error responses.
 */

import { Context } from "hono";
import { getAuthContext } from "../middleware/auth.middleware";
import { ErrorCodes } from "../middleware/errorHandler.middleware";

/**
 * Verify that the user has access to the specified organization
 * 
 * @param c - Hono context
 * @param orgId - Organization ID from route params
 * @returns true if access is granted, false otherwise
 */
export function verifyOrgAccess(c: Context, orgId: string): boolean {
  const { organizationId } = getAuthContext(c);
  return orgId === organizationId;
}

/**
 * Return a standardized 403 error response for organization access denial
 * 
 * @param c - Hono context
 * @returns JSON response with 403 status
 */
export function orgAccessDeniedResponse(c: Context) {
  return c.json(
    {
      error: {
        code: ErrorCodes.AUTHZ_ORGANIZATION_ACCESS_DENIED,
        message: "Organization not found or access denied",
      },
    },
    403
  );
}

/**
 * Verify organization access and return error response if denied
 * 
 * @param c - Hono context
 * @param orgId - Organization ID from route params
 * @returns null if access granted, error response if denied
 */
export function checkOrgAccess(c: Context, orgId: string) {
  if (!verifyOrgAccess(c, orgId)) {
    return orgAccessDeniedResponse(c);
  }
  return null;
}

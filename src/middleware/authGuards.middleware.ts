import { Context, Next } from "hono";
import { getAuthContext, hasOrganizationContext } from "./auth.middleware";
import { AppError, ErrorCodes } from "./errorHandler.middleware";

/**
 * Authorization guard middleware
 * 
 * These guards check if the authenticated user has the required permissions
 * to access specific endpoints.
 * 
 * Requirements: 2.6
 * - Property 11: Non-admin operations are rejected
 */

/**
 * Require authentication guard
 * 
 * Ensures that the user is authenticated and has a valid session.
 * This is the most basic guard that should be applied to all protected routes.
 * 
 * @throws {AppError} AUTHZ_001 if user is not authenticated
 */
export async function requireAuth(c: Context, next: Next) {
  const userId = c.get("userId");

  if (!userId) {
    throw new AppError(
      ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS,
      "Authentication required",
      401
    );
  }

  await next();
}

/**
 * Require organization context guard
 * 
 * Ensures that the user has an active organization context.
 * This should be applied to routes that require organization-scoped data access.
 * 
 * @throws {AppError} AUTHZ_002 if user doesn't have organization context
 */
export async function requireOrganization(c: Context, next: Next) {
  if (!hasOrganizationContext(c)) {
    throw new AppError(
      ErrorCodes.AUTHZ_ORGANIZATION_ACCESS_DENIED,
      "Organization context required. Please select an organization.",
      403
    );
  }

  await next();
}

/**
 * Require admin role guard
 * 
 * Ensures that the user has admin role in their organization.
 * This should be applied to routes that require admin permissions.
 * 
 * Requirements: 2.6
 * 
 * @throws {AppError} AUTHZ_003 if user is not an admin
 */
export async function requireAdmin(c: Context, next: Next) {
  const authContext = getAuthContext(c);

  if (authContext.role !== "admin") {
    throw new AppError(
      ErrorCodes.AUTHZ_ADMIN_ROLE_REQUIRED,
      "Admin role required for this operation",
      403
    );
  }

  await next();
}

/**
 * Require member role guard (member or admin)
 * 
 * Ensures that the user has at least member role in their organization.
 * This allows both members and admins to access the route.
 * 
 * @throws {AppError} AUTHZ_001 if user is only a viewer
 */
export async function requireMember(c: Context, next: Next) {
  const authContext = getAuthContext(c);

  if (authContext.role === "viewer") {
    throw new AppError(
      ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS,
      "Member or admin role required for this operation",
      403
    );
  }

  await next();
}

/**
 * Require specific role guard factory
 * 
 * Creates a guard that requires a specific role or higher.
 * Role hierarchy: viewer < member < admin
 * 
 * @param requiredRole The minimum required role
 * @returns Middleware function
 */
export function requireRole(requiredRole: "admin" | "member" | "viewer") {
  return async (c: Context, next: Next) => {
    const authContext = getAuthContext(c);

    const roleHierarchy = {
      viewer: 0,
      member: 1,
      admin: 2,
    };

    const userRoleLevel = roleHierarchy[authContext.role];
    const requiredRoleLevel = roleHierarchy[requiredRole];

    if (userRoleLevel < requiredRoleLevel) {
      throw new AppError(
        ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS,
        `${requiredRole} role or higher required for this operation`,
        403
      );
    }

    await next();
  };
}

/**
 * Verify organization access guard
 * 
 * Ensures that the organization ID in the URL matches the user's organization context.
 * This prevents users from accessing other organizations' data.
 * 
 * Requirements: 2.5, 10.1
 * - Property 10: Organization data isolation
 * - Property 51: Organization filtering on all queries
 * 
 * @throws {AppError} AUTHZ_002 if organization ID doesn't match
 */
export async function verifyOrganizationAccess(c: Context, next: Next) {
  const authContext = getAuthContext(c);
  const orgIdFromUrl = c.req.param("orgId");

  if (!orgIdFromUrl) {
    throw new AppError(
      ErrorCodes.AUTHZ_ORGANIZATION_ACCESS_DENIED,
      "Organization ID required in URL",
      400
    );
  }

  if (orgIdFromUrl !== authContext.organizationId) {
    throw new AppError(
      ErrorCodes.AUTHZ_ORGANIZATION_ACCESS_DENIED,
      "Access denied to this organization",
      403
    );
  }

  await next();
}

/**
 * Combined auth guard for organization-scoped routes
 * 
 * This is a convenience guard that combines:
 * 1. requireAuth - ensures user is authenticated
 * 2. requireOrganization - ensures user has organization context
 * 3. verifyOrganizationAccess - ensures URL org matches user's org
 * 
 * Use this for most organization-scoped routes.
 */
export async function requireOrgAccess(c: Context, next: Next) {
  await requireAuth(c, next);
  await requireOrganization(c, next);
  await verifyOrganizationAccess(c, next);
}

/**
 * Combined auth guard for admin-only organization routes
 * 
 * This combines requireOrgAccess with requireAdmin.
 * Use this for admin-only operations like inviting users or changing roles.
 */
export async function requireOrgAdmin(c: Context, next: Next) {
  await requireOrgAccess(c, next);
  await requireAdmin(c, next);
}

/**
 * Combined auth guard for member-level organization routes
 * 
 * This combines requireOrgAccess with requireMember.
 * Use this for routes that require write access (member or admin).
 */
export async function requireOrgMember(c: Context, next: Next) {
  await requireOrgAccess(c, next);
  await requireMember(c, next);
}

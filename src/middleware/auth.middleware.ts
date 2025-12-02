import { Context, Next } from "hono";
import { auth } from "../lib/auth";
import { db } from "../db";
import { member } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { AppError, ErrorCodes } from "./errorHandler.middleware";

/**
 * Auth context that gets attached to requests
 */
export interface AuthContext {
  userId: string;
  organizationId: string;
  role: "admin" | "member" | "viewer";
}

/**
 * Extend Hono's context with auth information
 */
declare module "hono" {
  interface ContextVariableMap {
    userId?: string;
    organizationId?: string;
    role?: "admin" | "member" | "viewer";
    session?: typeof auth.$Infer.Session.session;
    user?: typeof auth.$Infer.Session.user;
  }
}

/**
 * Authentication middleware
 * 
 * Validates the session token and attaches user identity to the request context.
 * Also loads the user's organization membership and role.
 *
 * 
 * @throws {AppError} AUTH_002 if session is expired
 * @throws {AppError} AUTH_003 if session is not found
 */
export async function authMiddleware(c: Context, next: Next) {
  try {
    // Get session from Better Auth
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    // Check if session exists
    if (!session) {
      throw new AppError(
        ErrorCodes.AUTH_SESSION_NOT_FOUND,
        "Authentication required",
        401
      );
    }

    // Check if session is expired
    const now = new Date();
    if (session.session.expiresAt < now) {
      throw new AppError(
        ErrorCodes.AUTH_SESSION_EXPIRED,
        "Session expired",
        401
      );
    }

    // Attach user and session to context
    c.set("userId", session.user.id);
    c.set("user", session.user);
    c.set("session", session.session);

    // Load user's organization membership and role
    // Check if there's an active organization in the session
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      // Load the membership to get the role
      const membership = await db
        .select()
        .from(member)
        .where(
          and(
            eq(member.userId, session.user.id),
            eq(member.organizationId, activeOrgId)
          )
        )
        .limit(1);

      if (membership.length > 0 && membership[0]) {
        const userRole = membership[0].role as "admin" | "member" | "viewer";
        c.set("organizationId", activeOrgId);
        c.set("role", userRole);
      }
    }

    await next();
  } catch (error) {
    // If it's already an AppError, rethrow it
    if (error instanceof AppError) {
      throw error;
    }

    // Otherwise, wrap it in an authentication error
    throw new AppError(
      ErrorCodes.AUTH_SESSION_NOT_FOUND,
      "Authentication failed",
      401
    );
  }
}

/**
 * Helper function to get auth context from Hono context
 * 
 * @throws {AppError} if auth context is not available
 */
export function getAuthContext(c: Context): AuthContext {
  const userId = c.get("userId");
  const organizationId = c.get("organizationId");
  const role = c.get("role");

  if (!userId || !organizationId || !role) {
    throw new AppError(
      ErrorCodes.AUTH_SESSION_NOT_FOUND,
      "Authentication context not available",
      401
    );
  }

  return {
    userId,
    organizationId,
    role,
  };
}

/**
 * Helper function to check if user has an organization context
 */
export function hasOrganizationContext(c: Context): boolean {
  return !!(c.get("organizationId") && c.get("role"));
}

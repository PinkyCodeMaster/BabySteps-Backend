import { describe, test, expect, mock } from "bun:test";
import { Context } from "hono";
import {
  requireAuth,
  requireAdmin,
  requireMember,
  verifyOrganizationAccess,
} from "./authGuards.middleware";
import { AppError, ErrorCodes } from "./errorHandler.middleware";

/**
 * Tests for authorization guards
 * 
 * These tests verify that the guards correctly enforce access control.
 */
describe("Authorization Guards", () => {
  describe("requireAuth", () => {
    test("should pass when userId is present", async () => {
      const mockContext = {
        get: (key: string) => (key === "userId" ? "user-123" : undefined),
      } as unknown as Context;

      const next = mock(() => Promise.resolve());

      await requireAuth(mockContext, next);

      expect(next).toHaveBeenCalled();
    });

    test("should throw when userId is missing", async () => {
      const mockContext = {
        get: () => undefined,
      } as unknown as Context;

      const next = mock(() => Promise.resolve());

      try {
        await requireAuth(mockContext, next);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(
          ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS
        );
        expect(next).not.toHaveBeenCalled();
      }
    });
  });

  describe("requireAdmin", () => {
    test("should pass when user is admin", async () => {
      const mockContext = {
        get: (key: string) => {
          if (key === "userId") return "user-123";
          if (key === "organizationId") return "org-123";
          if (key === "role") return "admin";
          return undefined;
        },
      } as unknown as Context;

      const next = mock(() => Promise.resolve());

      await requireAdmin(mockContext, next);

      expect(next).toHaveBeenCalled();
    });

    test("should throw when user is not admin", async () => {
      const mockContext = {
        get: (key: string) => {
          if (key === "userId") return "user-123";
          if (key === "organizationId") return "org-123";
          if (key === "role") return "member";
          return undefined;
        },
      } as unknown as Context;

      const next = mock(() => Promise.resolve());

      try {
        await requireAdmin(mockContext, next);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(
          ErrorCodes.AUTHZ_ADMIN_ROLE_REQUIRED
        );
        expect(next).not.toHaveBeenCalled();
      }
    });
  });

  describe("requireMember", () => {
    test("should pass when user is member", async () => {
      const mockContext = {
        get: (key: string) => {
          if (key === "userId") return "user-123";
          if (key === "organizationId") return "org-123";
          if (key === "role") return "member";
          return undefined;
        },
      } as unknown as Context;

      const next = mock(() => Promise.resolve());

      await requireMember(mockContext, next);

      expect(next).toHaveBeenCalled();
    });

    test("should pass when user is admin", async () => {
      const mockContext = {
        get: (key: string) => {
          if (key === "userId") return "user-123";
          if (key === "organizationId") return "org-123";
          if (key === "role") return "admin";
          return undefined;
        },
      } as unknown as Context;

      const next = mock(() => Promise.resolve());

      await requireMember(mockContext, next);

      expect(next).toHaveBeenCalled();
    });

    test("should throw when user is viewer", async () => {
      const mockContext = {
        get: (key: string) => {
          if (key === "userId") return "user-123";
          if (key === "organizationId") return "org-123";
          if (key === "role") return "viewer";
          return undefined;
        },
      } as unknown as Context;

      const next = mock(() => Promise.resolve());

      try {
        await requireMember(mockContext, next);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(
          ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS
        );
        expect(next).not.toHaveBeenCalled();
      }
    });
  });

  describe("verifyOrganizationAccess", () => {
    test("should pass when org IDs match", async () => {
      const mockContext = {
        get: (key: string) => {
          if (key === "userId") return "user-123";
          if (key === "organizationId") return "org-123";
          if (key === "role") return "member";
          return undefined;
        },
        req: {
          param: (key: string) => (key === "orgId" ? "org-123" : undefined),
        },
      } as unknown as Context;

      const next = mock(() => Promise.resolve());

      await verifyOrganizationAccess(mockContext, next);

      expect(next).toHaveBeenCalled();
    });

    test("should throw when org IDs don't match", async () => {
      const mockContext = {
        get: (key: string) => {
          if (key === "userId") return "user-123";
          if (key === "organizationId") return "org-123";
          if (key === "role") return "member";
          return undefined;
        },
        req: {
          param: (key: string) => (key === "orgId" ? "org-456" : undefined),
        },
      } as unknown as Context;

      const next = mock(() => Promise.resolve());

      try {
        await verifyOrganizationAccess(mockContext, next);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(
          ErrorCodes.AUTHZ_ORGANIZATION_ACCESS_DENIED
        );
        expect(next).not.toHaveBeenCalled();
      }
    });
  });
});

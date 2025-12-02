import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { debtService } from "../services";
import { authMiddleware, getAuthContext } from "../middleware/auth.middleware";
import {
  createDebtSchema,
  updateDebtSchema,
  recordPaymentSchema,
} from "../db/schema/debts";
import { z } from "zod";

/**
 * Debt router
 * 
 * Provides REST endpoints for debt management.
 * All endpoints require authentication and enforce organization-scoped access.
 * 
 * Endpoints:
 * - GET /orgs/:orgId/debts - List debts with pagination, sorting, filtering
 * - POST /orgs/:orgId/debts - Create new debt
 * - GET /orgs/:orgId/debts/:id - Get single debt
 * - PATCH /orgs/:orgId/debts/:id - Update debt
 * - DELETE /orgs/:orgId/debts/:id - Delete debt
 * - POST /orgs/:orgId/debts/:id/payment - Record payment on debt
 * 
 * Requirements: 5.1, 5.3
 */
const debtRouter = new Hono();

// All debt routes require authentication
debtRouter.use("/*", authMiddleware);

/**
 * Query parameters schema for list endpoint
 */
const listQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50),
  sortBy: z.enum(["createdAt", "name", "balance", "snowballPosition"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  status: z.enum(["active", "paid"]).optional(),
  isCcj: z.string().optional().transform(val => val === "true" ? true : val === "false" ? false : undefined),
  type: z.string().optional(),
});

/**
 * GET /orgs/:orgId/debts
 * 
 * List all debts for an organization with pagination, sorting, and filtering.
 * 
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
 * - sortBy: Sort field (createdAt, name, balance, snowballPosition)
 * - order: Sort order (asc, desc)
 * - status: Filter by status (active, paid)
 * - isCcj: Filter by CCJ status (true/false)
 * - type: Filter by debt type
 * 
 * Requirements: 5.1
 * Property 10: Organization data isolation
 * Property 29: Debts ordered by snowball position
 */
debtRouter.get("/:orgId/debts", zValidator("query", listQuerySchema), async (c) => {
  const { organizationId } = getAuthContext(c);
  const orgId = c.req.param("orgId");
  const query = c.req.valid("query");

  // Verify user is accessing their own organization
  if (orgId !== organizationId) {
    return c.json(
      {
        error: {
          code: "AUTHZ_002",
          message: "Organization not found or access denied",
        },
      },
      403
    );
  }

  const result = await debtService.listDebts(orgId, {
    page: query.page,
    limit: query.limit,
    sortBy: query.sortBy,
    order: query.order,
    status: query.status,
    isCcj: query.isCcj,
    type: query.type,
  });

  return c.json(result, 200);
});

/**
 * POST /orgs/:orgId/debts
 * 
 * Create a new debt for the organization.
 * 
 * Requirements: 5.1
 * Property 24: Debt creation with active status
 * Property 25: CCJ debts require deadline
 */
debtRouter.post(
  "/:orgId/debts",
  zValidator("json", createDebtSchema),
  async (c) => {
    const { userId, organizationId } = getAuthContext(c);
    const orgId = c.req.param("orgId");
    const data = c.req.valid("json");

    // Verify user is accessing their own organization
    if (orgId !== organizationId) {
      return c.json(
        {
          error: {
            code: "AUTHZ_002",
            message: "Organization not found or access denied",
          },
        },
        403
      );
    }

    const created = await debtService.createDebt(orgId, userId, data);

    return c.json(created, 201);
  }
);

/**
 * GET /orgs/:orgId/debts/:id
 * 
 * Get a single debt by ID.
 * 
 * Requirements: 5.1
 * Property 10: Organization data isolation
 */
debtRouter.get("/:orgId/debts/:id", async (c) => {
  const { organizationId } = getAuthContext(c);
  const orgId = c.req.param("orgId");
  const debtId = c.req.param("id");

  // Verify user is accessing their own organization
  if (orgId !== organizationId) {
    return c.json(
      {
        error: {
          code: "AUTHZ_002",
          message: "Organization not found or access denied",
        },
      },
      403
    );
  }

  const debt = await debtService.getDebt(debtId, orgId);

  return c.json(debt, 200);
});

/**
 * PATCH /orgs/:orgId/debts/:id
 * 
 * Update an existing debt.
 * 
 * Requirements: 5.1
 * Property 25: CCJ debts require deadline
 * Property 28: Status changes are validated and audited
 */
debtRouter.patch(
  "/:orgId/debts/:id",
  zValidator("json", updateDebtSchema),
  async (c) => {
    const { userId, organizationId } = getAuthContext(c);
    const orgId = c.req.param("orgId");
    const debtId = c.req.param("id");
    const data = c.req.valid("json");

    // Verify user is accessing their own organization
    if (orgId !== organizationId) {
      return c.json(
        {
          error: {
            code: "AUTHZ_002",
            message: "Organization not found or access denied",
          },
        },
        403
      );
    }

    const updated = await debtService.updateDebt(
      debtId,
      orgId,
      userId,
      data
    );

    return c.json(updated, 200);
  }
);

/**
 * DELETE /orgs/:orgId/debts/:id
 * 
 * Delete a debt.
 * 
 * Requirements: 5.1
 */
debtRouter.delete("/:orgId/debts/:id", async (c) => {
  const { userId, organizationId } = getAuthContext(c);
  const orgId = c.req.param("orgId");
  const debtId = c.req.param("id");

  // Verify user is accessing their own organization
  if (orgId !== organizationId) {
    return c.json(
      {
        error: {
          code: "AUTHZ_002",
          message: "Organization not found or access denied",
        },
      },
      403
    );
  }

  await debtService.deleteDebt(debtId, orgId, userId);

  return c.json({ message: "Debt deleted successfully" }, 200);
});

/**
 * POST /orgs/:orgId/debts/:id/payment
 * 
 * Record a payment on a debt.
 * 
 * Requirements: 5.3
 * Property 26: Payment recording reduces balance
 * Property 27: Zero balance transitions to paid
 * Property 28: Status changes are validated and audited
 */
debtRouter.post(
  "/:orgId/debts/:id/payment",
  zValidator("json", recordPaymentSchema),
  async (c) => {
    const { userId, organizationId } = getAuthContext(c);
    const orgId = c.req.param("orgId");
    const debtId = c.req.param("id");
    const data = c.req.valid("json");

    // Verify user is accessing their own organization
    if (orgId !== organizationId) {
      return c.json(
        {
          error: {
            code: "AUTHZ_002",
            message: "Organization not found or access denied",
          },
        },
        403
      );
    }

    const updated = await debtService.recordPayment(
      debtId,
      orgId,
      userId,
      data
    );

    return c.json(updated, 200);
  }
);

export default debtRouter;

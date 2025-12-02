import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { incomeService } from "../services";
import { authMiddleware, getAuthContext } from "../middleware/auth.middleware";
import {
  createIncomeSchema,
  updateIncomeSchema,
} from "../db/schema/incomes";
import { z } from "zod";

/**
 * Income router
 * 
 * Provides REST endpoints for income management.
 * All endpoints require authentication and enforce organization-scoped access.
 * 
 * Endpoints:
 * - GET /orgs/:orgId/incomes - List incomes with pagination, sorting, filtering
 * - POST /orgs/:orgId/incomes - Create new income
 * - GET /orgs/:orgId/incomes/:id - Get single income
 * - PATCH /orgs/:orgId/incomes/:id - Update income
 * - DELETE /orgs/:orgId/incomes/:id - Delete income
 * 
 * Requirements: 3.1, 3.5, 3.6
 */
const incomeRouter = new Hono();

// All income routes require authentication
incomeRouter.use("/*", authMiddleware);

/**
 * Query parameters schema for list endpoint
 */
const listQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50),
  sortBy: z.enum(["createdAt", "name", "amount"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

/**
 * GET /orgs/:orgId/incomes
 * 
 * List all incomes for an organization with pagination and sorting.
 * 
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
 * - sortBy: Sort field (createdAt, name, amount)
 * - order: Sort order (asc, desc)
 * 
 * Requirements: 3.1
 * Property 10: Organization data isolation
 */
incomeRouter.get("/:orgId/incomes", zValidator("query", listQuerySchema), async (c) => {
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

  const result = await incomeService.listIncomes(orgId, {
    page: query.page,
    limit: query.limit,
    sortBy: query.sortBy,
    order: query.order,
  });

  return c.json(result, 200);
});

/**
 * POST /orgs/:orgId/incomes
 * 
 * Create a new income for the organization.
 * 
 * Requirements: 3.1
 * Property 12: Income creation with organization association
 */
incomeRouter.post(
  "/:orgId/incomes",
  zValidator("json", createIncomeSchema),
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

    const created = await incomeService.createIncome(orgId, userId, data);

    return c.json(created, 201);
  }
);

/**
 * GET /orgs/:orgId/incomes/:id
 * 
 * Get a single income by ID.
 * 
 * Requirements: 3.1
 * Property 10: Organization data isolation
 */
incomeRouter.get("/:orgId/incomes/:id", async (c) => {
  const { organizationId } = getAuthContext(c);
  const orgId = c.req.param("orgId");
  const incomeId = c.req.param("id");

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

  const income = await incomeService.getIncome(incomeId, orgId);

  return c.json(income, 200);
});

/**
 * PATCH /orgs/:orgId/incomes/:id
 * 
 * Update an existing income.
 * 
 * Requirements: 3.5
 * Property 16: Income updates respect organization boundaries
 */
incomeRouter.patch(
  "/:orgId/incomes/:id",
  zValidator("json", updateIncomeSchema),
  async (c) => {
    const { userId, organizationId } = getAuthContext(c);
    const orgId = c.req.param("orgId");
    const incomeId = c.req.param("id");
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

    const updated = await incomeService.updateIncome(
      incomeId,
      orgId,
      userId,
      data
    );

    return c.json(updated, 200);
  }
);

/**
 * DELETE /orgs/:orgId/incomes/:id
 * 
 * Delete an income.
 * 
 * Requirements: 3.6
 * Property 17: Income deletion triggers recalculation
 */
incomeRouter.delete("/:orgId/incomes/:id", async (c) => {
  const { userId, organizationId } = getAuthContext(c);
  const orgId = c.req.param("orgId");
  const incomeId = c.req.param("id");

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

  await incomeService.deleteIncome(incomeId, orgId, userId);

  return c.json({ message: "Income deleted successfully" }, 200);
});

export default incomeRouter;

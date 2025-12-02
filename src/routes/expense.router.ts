import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { expenseService } from "../services";
import { authMiddleware, getAuthContext } from "../middleware/auth.middleware";
import {
  createExpenseSchema,
  updateExpenseSchema,
} from "../db/schema/expenses";
import { z } from "zod";

/**
 * Expense router
 * 
 * Provides REST endpoints for expense management.
 * All endpoints require authentication and enforce organization-scoped access.
 * 
 * Endpoints:
 * - GET /orgs/:orgId/expenses - List expenses with pagination, sorting, filtering
 * - POST /orgs/:orgId/expenses - Create new expense
 * - GET /orgs/:orgId/expenses/:id - Get single expense
 * - PATCH /orgs/:orgId/expenses/:id - Update expense
 * - DELETE /orgs/:orgId/expenses/:id - Delete expense
 * 
 * Requirements: 4.1
 */
const expenseRouter = new Hono();

// All expense routes require authentication
expenseRouter.use("/*", authMiddleware);

/**
 * Query parameters schema for list endpoint
 */
const listQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50),
  sortBy: z.enum(["createdAt", "name", "amount"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  category: z.string().optional(),
  priority: z.string().optional(),
  isUcPaid: z.string().optional().transform(val => val === "true" ? true : val === "false" ? false : undefined),
});

/**
 * GET /orgs/:orgId/expenses
 * 
 * List all expenses for an organization with pagination, sorting, and filtering.
 * 
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
 * - sortBy: Sort field (createdAt, name, amount)
 * - order: Sort order (asc, desc)
 * - category: Filter by category
 * - priority: Filter by priority
 * - isUcPaid: Filter by UC-paid status (true/false)
 * 
 * Requirements: 4.1
 * Property 10: Organization data isolation
 */
expenseRouter.get("/:orgId/expenses", zValidator("query", listQuerySchema), async (c) => {
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

  const result = await expenseService.listExpenses(orgId, {
    page: query.page,
    limit: query.limit,
    sortBy: query.sortBy,
    order: query.order,
    category: query.category,
    priority: query.priority,
    isUcPaid: query.isUcPaid,
  });

  return c.json(result, 200);
});

/**
 * POST /orgs/:orgId/expenses
 * 
 * Create a new expense for the organization.
 * 
 * Requirements: 4.1
 * Property 18: Expense creation with organization association
 */
expenseRouter.post(
  "/:orgId/expenses",
  zValidator("json", createExpenseSchema),
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

    const created = await expenseService.createExpense(orgId, userId, data);

    return c.json(created, 201);
  }
);

/**
 * GET /orgs/:orgId/expenses/:id
 * 
 * Get a single expense by ID.
 * 
 * Requirements: 4.1
 * Property 10: Organization data isolation
 */
expenseRouter.get("/:orgId/expenses/:id", async (c) => {
  const { organizationId } = getAuthContext(c);
  const orgId = c.req.param("orgId");
  const expenseId = c.req.param("id");

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

  const expense = await expenseService.getExpense(expenseId, orgId);

  return c.json(expense, 200);
});

/**
 * PATCH /orgs/:orgId/expenses/:id
 * 
 * Update an existing expense.
 * 
 * Requirements: 4.1
 * Property 18: Expense creation with organization association
 */
expenseRouter.patch(
  "/:orgId/expenses/:id",
  zValidator("json", updateExpenseSchema),
  async (c) => {
    const { userId, organizationId } = getAuthContext(c);
    const orgId = c.req.param("orgId");
    const expenseId = c.req.param("id");
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

    const updated = await expenseService.updateExpense(
      expenseId,
      orgId,
      userId,
      data
    );

    return c.json(updated, 200);
  }
);

/**
 * DELETE /orgs/:orgId/expenses/:id
 * 
 * Delete an expense.
 * 
 * Requirements: 4.1
 */
expenseRouter.delete("/:orgId/expenses/:id", async (c) => {
  const { userId, organizationId } = getAuthContext(c);
  const orgId = c.req.param("orgId");
  const expenseId = c.req.param("id");

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

  await expenseService.deleteExpense(expenseId, orgId, userId);

  return c.json({ message: "Expense deleted successfully" }, 200);
});

export default expenseRouter;

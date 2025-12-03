import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { expenseService } from "../services";
import { authMiddleware, getAuthContext } from "../middleware/auth.middleware";
import {
  createExpenseSchema,
  updateExpenseSchema,
} from "../db/schema/expenses";

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
const expenseRouter = new OpenAPIHono();

// All expense routes require authentication
expenseRouter.use("/*", authMiddleware);

// Common schemas
const OrgIdParamSchema = z.object({
  orgId: z.string().openapi({ example: 'org_123' }),
});

const ExpenseIdParamSchema = z.object({
  orgId: z.string().openapi({ example: 'org_123' }),
  id: z.string().openapi({ example: 'expense_456' }),
});

const ListQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1).openapi({ example: '1' }),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50).openapi({ example: '50' }),
  sortBy: z.enum(["createdAt", "name", "amount"]).optional().openapi({ example: 'createdAt' }),
  order: z.enum(["asc", "desc"]).optional().openapi({ example: 'desc' }),
  category: z.string().optional().openapi({ example: 'housing' }),
  priority: z.string().optional().openapi({ example: 'high' }),
  isUcPaid: z.string().optional().transform(val => val === "true" ? true : val === "false" ? false : undefined).openapi({ example: 'false' }),
});

const ExpenseResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  amount: z.string(),
  frequency: z.string(),
  category: z.string(),
  priority: z.string(),
  isUcPaid: z.boolean(),
  dueDay: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ExpensesListResponseSchema = z.object({
  expenses: z.array(ExpenseResponseSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
  }),
});

const MessageResponseSchema = z.object({
  message: z.string(),
});

const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

/**
 * GET /orgs/:orgId/expenses
 * 
 * List all expenses for an organization with pagination, sorting, and filtering.
 * 
 * Requirements: 4.1
 * Property 10: Organization data isolation
 */
const listExpensesRoute = createRoute({
  method: 'get',
  path: '/:orgId/expenses',
  tags: ['Expenses'],
  summary: 'List expenses',
  description: 'Returns all expenses for an organization with pagination, sorting, and filtering',
  request: {
    params: OrgIdParamSchema,
    query: ListQuerySchema,
  },
  responses: {
    200: {
      description: 'List of expenses',
      content: {
        'application/json': {
          schema: ExpensesListResponseSchema,
        },
      },
    },
    403: {
      description: 'Access denied',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

expenseRouter.openapi(listExpensesRoute, async (c) => {
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
const createExpenseRoute = createRoute({
  method: 'post',
  path: '/:orgId/expenses',
  tags: ['Expenses'],
  summary: 'Create expense',
  description: 'Creates a new expense for an organization',
  request: {
    params: OrgIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: createExpenseSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Created expense',
      content: {
        'application/json': {
          schema: ExpenseResponseSchema,
        },
      },
    },
    403: {
      description: 'Access denied',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

expenseRouter.openapi(createExpenseRoute, async (c) => {
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
});

/**
 * GET /orgs/:orgId/expenses/:id
 * 
 * Get a single expense by ID.
 * 
 * Requirements: 4.1
 * Property 10: Organization data isolation
 */
const getExpenseRoute = createRoute({
  method: 'get',
  path: '/:orgId/expenses/:id',
  tags: ['Expenses'],
  summary: 'Get expense',
  description: 'Returns a single expense by ID',
  request: {
    params: ExpenseIdParamSchema,
  },
  responses: {
    200: {
      description: 'Expense details',
      content: {
        'application/json': {
          schema: ExpenseResponseSchema,
        },
      },
    },
    403: {
      description: 'Access denied',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

expenseRouter.openapi(getExpenseRoute, async (c) => {
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
const updateExpenseRoute = createRoute({
  method: 'patch',
  path: '/:orgId/expenses/:id',
  tags: ['Expenses'],
  summary: 'Update expense',
  description: 'Updates an existing expense',
  request: {
    params: ExpenseIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updateExpenseSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated expense',
      content: {
        'application/json': {
          schema: ExpenseResponseSchema,
        },
      },
    },
    403: {
      description: 'Access denied',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

expenseRouter.openapi(updateExpenseRoute, async (c) => {
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
});

/**
 * DELETE /orgs/:orgId/expenses/:id
 * 
 * Delete an expense.
 * 
 * Requirements: 4.1
 */
const deleteExpenseRoute = createRoute({
  method: 'delete',
  path: '/:orgId/expenses/:id',
  tags: ['Expenses'],
  summary: 'Delete expense',
  description: 'Deletes an expense',
  request: {
    params: ExpenseIdParamSchema,
  },
  responses: {
    200: {
      description: 'Expense deleted',
      content: {
        'application/json': {
          schema: MessageResponseSchema,
        },
      },
    },
    403: {
      description: 'Access denied',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

expenseRouter.openapi(deleteExpenseRoute, async (c) => {
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

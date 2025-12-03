import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { incomeService } from "../services";
import { authMiddleware, getAuthContext } from "../middleware/auth.middleware";
import {
  createIncomeSchema,
  updateIncomeSchema,
} from "../db/schema/incomes";

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
const incomeRouter = new OpenAPIHono();

// All income routes require authentication
incomeRouter.use("/*", authMiddleware);

// Common schemas
const OrgIdParamSchema = z.object({
  orgId: z.string().openapi({ example: 'org_123' }),
});

const IncomeIdParamSchema = z.object({
  orgId: z.string().openapi({ example: 'org_123' }),
  id: z.string().openapi({ example: 'income_456' }),
});

const ListQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1).openapi({ example: '1' }),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50).openapi({ example: '50' }),
  sortBy: z.enum(["createdAt", "name", "amount"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

const IncomeResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  type: z.string(),
  name: z.string(),
  amount: z.string(),
  frequency: z.enum(['one-time', 'weekly', 'fortnightly', 'monthly', 'annual']),
  isNet: z.boolean(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const IncomesListResponseSchema = z.object({
  incomes: z.array(IncomeResponseSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
  }),
});

const DeleteResponseSchema = z.object({
  message: z.string(),
});

const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
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
const listIncomesRoute = createRoute({
  method: 'get',
  path: '/:orgId/incomes',
  tags: ['Incomes'],
  summary: 'List incomes',
  description: 'Returns all incomes for an organization with pagination and sorting',
  request: {
    params: OrgIdParamSchema,
    query: ListQuerySchema,
  },
  responses: {
    200: {
      description: 'List of incomes',
      content: {
        'application/json': {
          schema: IncomesListResponseSchema,
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

incomeRouter.openapi(listIncomesRoute, async (c) => {
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
const createIncomeRoute = createRoute({
  method: 'post',
  path: '/:orgId/incomes',
  tags: ['Incomes'],
  summary: 'Create income',
  description: 'Creates a new income for an organization',
  request: {
    params: OrgIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: createIncomeSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Income created',
      content: {
        'application/json': {
          schema: IncomeResponseSchema,
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

incomeRouter.openapi(createIncomeRoute, async (c) => {
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
const getIncomeRoute = createRoute({
  method: 'get',
  path: '/:orgId/incomes/:id',
  tags: ['Incomes'],
  summary: 'Get income',
  description: 'Returns a single income by ID',
  request: {
    params: IncomeIdParamSchema,
  },
  responses: {
    200: {
      description: 'Income details',
      content: {
        'application/json': {
          schema: IncomeResponseSchema,
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

incomeRouter.openapi(getIncomeRoute, async (c) => {
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
const updateIncomeRoute = createRoute({
  method: 'patch',
  path: '/:orgId/incomes/:id',
  tags: ['Incomes'],
  summary: 'Update income',
  description: 'Updates an existing income',
  request: {
    params: IncomeIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updateIncomeSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated income',
      content: {
        'application/json': {
          schema: IncomeResponseSchema,
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

incomeRouter.openapi(updateIncomeRoute, async (c) => {
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
const deleteIncomeRoute = createRoute({
  method: 'delete',
  path: '/:orgId/incomes/:id',
  tags: ['Incomes'],
  summary: 'Delete income',
  description: 'Deletes an income',
  request: {
    params: IncomeIdParamSchema,
  },
  responses: {
    200: {
      description: 'Income deleted',
      content: {
        'application/json': {
          schema: DeleteResponseSchema,
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

incomeRouter.openapi(deleteIncomeRoute, async (c) => {
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

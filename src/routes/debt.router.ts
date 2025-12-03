import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { debtService } from "../services";
import { authMiddleware, getAuthContext } from "../middleware/auth.middleware";
import {
  createDebtSchema,
  updateDebtSchema,
  recordPaymentSchema,
} from "../db/schema/debts";

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
const debtRouter = new OpenAPIHono();

// All debt routes require authentication
debtRouter.use("/*", authMiddleware);

// Common schemas
const OrgIdParamSchema = z.object({
  orgId: z.string().openapi({ example: 'org_123' }),
});

const DebtIdParamSchema = z.object({
  orgId: z.string().openapi({ example: 'org_123' }),
  id: z.string().openapi({ example: 'debt_456' }),
});

const ListQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1).openapi({ example: '1' }),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50).openapi({ example: '50' }),
  sortBy: z.enum(["createdAt", "name", "balance", "snowballPosition"]).optional().openapi({ example: 'snowballPosition' }),
  order: z.enum(["asc", "desc"]).optional().openapi({ example: 'asc' }),
  status: z.enum(["active", "paid"]).optional().openapi({ example: 'active' }),
  isCcj: z.string().optional().transform(val => val === "true" ? true : val === "false" ? false : undefined).openapi({ example: 'false' }),
  type: z.string().optional().openapi({ example: 'credit_card' }),
});

const DebtResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  type: z.string(),
  balance: z.string(),
  interestRate: z.string(),
  minimumPayment: z.string(),
  snowballPosition: z.number().nullable(),
  status: z.string(),
  isCcj: z.boolean(),
  ccjDeadline: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const DebtsListResponseSchema = z.object({
  debts: z.array(DebtResponseSchema),
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
 * GET /orgs/:orgId/debts
 * 
 * List all debts for an organization with pagination, sorting, and filtering.
 * 
 * Requirements: 5.1
 * Property 10: Organization data isolation
 * Property 29: Debts ordered by snowball position
 */
const listDebtsRoute = createRoute({
  method: 'get',
  path: '/:orgId/debts',
  tags: ['Debts'],
  summary: 'List debts',
  description: 'Returns all debts for an organization with pagination, sorting, and filtering',
  request: {
    params: OrgIdParamSchema,
    query: ListQuerySchema,
  },
  responses: {
    200: {
      description: 'List of debts',
      content: {
        'application/json': {
          schema: DebtsListResponseSchema,
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

debtRouter.openapi(listDebtsRoute, async (c) => {
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
const createDebtRoute = createRoute({
  method: 'post',
  path: '/:orgId/debts',
  tags: ['Debts'],
  summary: 'Create debt',
  description: 'Creates a new debt for an organization',
  request: {
    params: OrgIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: createDebtSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Created debt',
      content: {
        'application/json': {
          schema: DebtResponseSchema,
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

debtRouter.openapi(createDebtRoute, async (c) => {
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
});

/**
 * GET /orgs/:orgId/debts/:id
 * 
 * Get a single debt by ID.
 * 
 * Requirements: 5.1
 * Property 10: Organization data isolation
 */
const getDebtRoute = createRoute({
  method: 'get',
  path: '/:orgId/debts/:id',
  tags: ['Debts'],
  summary: 'Get debt',
  description: 'Returns a single debt by ID',
  request: {
    params: DebtIdParamSchema,
  },
  responses: {
    200: {
      description: 'Debt details',
      content: {
        'application/json': {
          schema: DebtResponseSchema,
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

debtRouter.openapi(getDebtRoute, async (c) => {
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
const updateDebtRoute = createRoute({
  method: 'patch',
  path: '/:orgId/debts/:id',
  tags: ['Debts'],
  summary: 'Update debt',
  description: 'Updates an existing debt',
  request: {
    params: DebtIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updateDebtSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated debt',
      content: {
        'application/json': {
          schema: DebtResponseSchema,
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

debtRouter.openapi(updateDebtRoute, async (c) => {
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
});

/**
 * DELETE /orgs/:orgId/debts/:id
 * 
 * Delete a debt.
 * 
 * Requirements: 5.1
 */
const deleteDebtRoute = createRoute({
  method: 'delete',
  path: '/:orgId/debts/:id',
  tags: ['Debts'],
  summary: 'Delete debt',
  description: 'Deletes a debt',
  request: {
    params: DebtIdParamSchema,
  },
  responses: {
    200: {
      description: 'Debt deleted',
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

debtRouter.openapi(deleteDebtRoute, async (c) => {
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
const recordPaymentRoute = createRoute({
  method: 'post',
  path: '/:orgId/debts/:id/payment',
  tags: ['Debts'],
  summary: 'Record payment',
  description: 'Records a payment on a debt',
  request: {
    params: DebtIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: recordPaymentSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated debt after payment',
      content: {
        'application/json': {
          schema: DebtResponseSchema,
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

debtRouter.openapi(recordPaymentRoute, async (c) => {
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
});

export default debtRouter;

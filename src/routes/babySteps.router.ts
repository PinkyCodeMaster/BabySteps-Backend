import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { authMiddleware, getAuthContext } from "../middleware/auth.middleware";
import { babyStepsService } from "../services/babySteps.service";
import { updateBabyStepsSchema } from "../db/schema/babySteps";

/**
 * Baby Steps router
 * 
 * Provides REST endpoints for Baby Steps progress tracking including:
 * - Get current Baby Steps status
 * - Update Baby Steps progress
 * 
 * All endpoints require authentication and enforce organization-scoped access.
 * 
 * Endpoints:
 * - GET /orgs/:orgId/baby-steps - Get current Baby Steps status
 * - PATCH /orgs/:orgId/baby-steps - Update Baby Steps progress
 * 
 * Requirements: 8.1, 8.6
 */
const babyStepsRouter = new OpenAPIHono();

// All Baby Steps routes require authentication
babyStepsRouter.use("/*", authMiddleware);

// Common schemas
const OrgIdParamSchema = z.object({
  orgId: z.string().openapi({ example: 'org_123' }),
});

const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
});

const BabyStepsResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  currentStep: z.number().int().min(1).max(7),
  stepProgress: z.record(z.string(), z.any()).nullable(),
  updatedAt: z.string(),
});

/**
 * GET /orgs/:orgId/baby-steps
 * 
 * Returns the current Baby Steps status for an organization.
 * 
 * This endpoint:
 * 1. Fetches the current Baby Steps record for the organization
 * 2. Returns the current step and progress data
 * 3. Creates a default record if one doesn't exist (Step 1, no progress)
 * 
 * Requirements: 8.1
 * Property 41: Baby Steps status includes progress data
 */
const getBabyStepsRoute = createRoute({
  method: 'get',
  path: '/:orgId/baby-steps',
  tags: ['Baby Steps'],
  summary: 'Get Baby Steps status',
  description: 'Returns the current Baby Steps progress for an organization',
  request: {
    params: OrgIdParamSchema,
  },
  responses: {
    200: {
      description: 'Baby Steps status',
      content: {
        'application/json': {
          schema: BabyStepsResponseSchema,
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

babyStepsRouter.openapi(getBabyStepsRoute, async (c) => {
  const { organizationId } = getAuthContext(c);
  const orgId = c.req.param("orgId");

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

  // Get current Baby Steps status
  const status = await babyStepsService.getCurrentStep(orgId);

  // Format response
  const response = {
    id: status.id,
    organizationId: status.organizationId,
    currentStep: status.currentStep,
    stepProgress: status.stepProgress as Record<string, any> | null,
    updatedAt: status.updatedAt.toISOString(),
  };

  return c.json(response, 200);
});

/**
 * PATCH /orgs/:orgId/baby-steps
 * 
 * Updates Baby Steps progress for an organization.
 * 
 * This endpoint:
 * 1. Validates the update request against Zod schema
 * 2. Validates step progression requirements
 * 3. Updates the Baby Steps record
 * 4. Creates an audit log entry
 * 5. Returns the updated status
 * 
 * Requirements: 8.6
 * Property 46: Baby Steps progress validation
 */
const updateBabyStepsRoute = createRoute({
  method: 'patch',
  path: '/:orgId/baby-steps',
  tags: ['Baby Steps'],
  summary: 'Update Baby Steps progress',
  description: 'Updates the Baby Steps progress for an organization',
  request: {
    params: OrgIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updateBabyStepsSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated Baby Steps status',
      content: {
        'application/json': {
          schema: BabyStepsResponseSchema,
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
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

babyStepsRouter.openapi(updateBabyStepsRoute, async (c) => {
  const { organizationId, userId } = getAuthContext(c);
  const orgId = c.req.param("orgId");

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

  // Parse and validate request body
  const body = await c.req.json();
  const validationResult = updateBabyStepsSchema.safeParse(body);

  if (!validationResult.success) {
    return c.json(
      {
        error: {
          code: "VAL_001",
          message: "Invalid request schema",
          details: validationResult.error.flatten().fieldErrors,
        },
      },
      400
    );
  }

  const updateData = validationResult.data;

  // Update Baby Steps progress
  const updated = await babyStepsService.updateProgress(
    orgId,
    userId,
    updateData
  );

  // Format response
  const response = {
    id: updated.id,
    organizationId: updated.organizationId,
    currentStep: updated.currentStep,
    stepProgress: updated.stepProgress as Record<string, any> | null,
    updatedAt: updated.updatedAt.toISOString(),
  };

  return c.json(response, 200);
});

export default babyStepsRouter;

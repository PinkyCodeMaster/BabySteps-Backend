import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { organizationService } from "../services";
import { authMiddleware, getAuthContext } from "../middleware/auth.middleware";
import { requireAdmin } from "../middleware/authGuards.middleware";
import { updateMemberRoleSchema } from "../db/schema";

/**
 * Organization router
 * 
 * Provides REST endpoints for organization management.
 * Note: Organization creation and invitations are handled by Better Auth
 * at /api/v1/auth/organization/* endpoints.
 * 
 * These endpoints provide additional functionality:
 * - GET /orgs/:id - Get organization details
 * - GET /orgs/:orgId/members - List organization members
 * - PATCH /orgs/:orgId/members/:memberId - Update member role (admin only)
 * 
 */
const organizationRouter = new OpenAPIHono();

// All organization routes require authentication
organizationRouter.use("/*", authMiddleware);

// Common schemas
const OrgIdParamSchema = z.object({
  id: z.string().openapi({ example: 'org_123' }),
});

const OrgMembersParamSchema = z.object({
  orgId: z.string().openapi({ example: 'org_123' }),
});

const UpdateMemberParamSchema = z.object({
  orgId: z.string().openapi({ example: 'org_123' }),
  memberId: z.string().openapi({ example: 'member_456' }),
});

const OrganizationResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().nullable(),
  createdAt: z.string(),
  metadata: z.string().nullable(),
});

const MemberResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  organizationId: z.string(),
  role: z.string(),
  createdAt: z.string(),
});

const MembersListResponseSchema = z.object({
  members: z.array(MemberResponseSchema),
});

const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

/**
 * GET /orgs/:id
 * 
 * Get organization details
 * 
 */
const getOrganizationRoute = createRoute({
  method: 'get',
  path: '/:id',
  tags: ['Organizations'],
  summary: 'Get organization details',
  description: 'Returns details for a specific organization',
  request: {
    params: OrgIdParamSchema,
  },
  responses: {
    200: {
      description: 'Organization details',
      content: {
        'application/json': {
          schema: OrganizationResponseSchema,
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

organizationRouter.openapi(getOrganizationRoute, async (c) => {
  const { userId } = getAuthContext(c);
  const orgId = c.req.param("id");

  const org = await organizationService.getOrganization(orgId, userId);

  return c.json(org, 200);
});

/**
 * GET /orgs/:orgId/members
 * 
 * List all members of an organization
 * 
 */
const listMembersRoute = createRoute({
  method: 'get',
  path: '/:orgId/members',
  tags: ['Organizations'],
  summary: 'List organization members',
  description: 'Returns all members of an organization',
  request: {
    params: OrgMembersParamSchema,
  },
  responses: {
    200: {
      description: 'List of organization members',
      content: {
        'application/json': {
          schema: MembersListResponseSchema,
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

organizationRouter.openapi(listMembersRoute, async (c) => {
  const { userId } = getAuthContext(c);
  const orgId = c.req.param("orgId");

  const members = await organizationService.listMembers(orgId, userId);

  return c.json({ members }, 200);
});

/**
 * PATCH /orgs/:orgId/members/:memberId
 * 
 * Update a member's role (admin only)
 * 
 */
const updateMemberRoleRoute = createRoute({
  method: 'patch',
  path: '/:orgId/members/:memberId',
  tags: ['Organizations'],
  summary: 'Update member role',
  description: 'Updates a member\'s role in an organization (admin only)',
  request: {
    params: UpdateMemberParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updateMemberRoleSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated member details',
      content: {
        'application/json': {
          schema: MemberResponseSchema,
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

// Apply requireAdmin middleware separately
organizationRouter.use("/:orgId/members/:memberId", requireAdmin);

organizationRouter.openapi(updateMemberRoleRoute, async (c) => {
  const { userId } = getAuthContext(c);
  const orgId = c.req.param("orgId");
  const memberId = c.req.param("memberId");
  const { role } = c.req.valid("json");

  const updated = await organizationService.updateMemberRole(
    memberId,
    role,
    userId,
    orgId
  );

  return c.json(updated, 200);
});

export default organizationRouter;

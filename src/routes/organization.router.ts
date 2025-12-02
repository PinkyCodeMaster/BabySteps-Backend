import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
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
const organizationRouter = new Hono();

// All organization routes require authentication
organizationRouter.use("/*", authMiddleware);

/**
 * GET /orgs/:id
 * 
 * Get organization details
 * 
 */
organizationRouter.get("/:id", async (c) => {
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
organizationRouter.get("/:orgId/members", async (c) => {
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
organizationRouter.patch(
  "/:orgId/members/:memberId",
  requireAdmin,
  zValidator("json", updateMemberRoleSchema),
  async (c) => {
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
  }
);

export default organizationRouter;

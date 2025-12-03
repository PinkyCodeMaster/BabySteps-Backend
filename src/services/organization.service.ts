import { db } from "../db";
import { organization, member } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { auditService } from "./audit.service";
import { withTransaction } from "../db/transaction";
import { AppError, ErrorCodes } from "../middleware/errorHandler.middleware";

/**
 * Organization Service
 * 
 * Provides business logic for organization management operations.
 * Better Auth handles core organization operations (create, invite, etc.),
 * this service provides additional queries and audit logging hooks.
 * 
 */
export class OrganizationService {
  /**
   * Log organization creation (called after Better Auth creates org)
   * 
   * This is a helper to add audit logging after Better Auth creates an organization.
   * Better Auth automatically creates the organization and assigns the creator as admin.
   * 
   * @param orgId - Organization ID
   * @param name - Organization name
   * @param creatorUserId - User ID of the creator
   */
  async logOrganizationCreation(
    orgId: string,
    name: string,
    creatorUserId: string
  ): Promise<void> {
    await auditService.log({
      userId: creatorUserId,
      organizationId: orgId,
      action: "ORGANIZATION_CREATED",
      affectedRecordIds: [orgId],
      metadata: { name },
    });
  }

  /**
   * Get organization by ID with organization filtering
   * 
   * Ensures users can only access organizations they belong to.
   * 
   * @param orgId - Organization ID
   * @param userId - User ID making the request
   * @returns The organization
   * @throws {AppError} if organization not found or user doesn't have access
   * 
   */
  async getOrganization(
    orgId: string,
    userId: string
  ): Promise<typeof organization.$inferSelect> {
    // Verify user has access to this organization
    const membership = await db
      .select()
      .from(member)
      .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
      .limit(1);

    if (membership.length === 0) {
      throw new AppError(
        ErrorCodes.AUTHZ_ORGANIZATION_ACCESS_DENIED,
        "Organization not found or access denied",
        403
      );
    }

    // Fetch organization
    const org = await db
      .select()
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);

    if (!org[0]) {
      throw new AppError(
        ErrorCodes.RES_NOT_FOUND,
        "Organization not found",
        404
      );
    }

    return org[0];
  }

  /**
   * Log invitation creation (called after Better Auth creates invitation)
   * 
   * @param invitationId - Invitation ID
   * @param orgId - Organization ID
   * @param email - Email address invited
   * @param role - Role assigned
   * @param inviterId - User ID of inviter
   * 
   */
  async logInvitationCreation(
    invitationId: string,
    orgId: string,
    email: string,
    role: string,
    inviterId: string
  ): Promise<void> {
    await auditService.log({
      userId: inviterId,
      organizationId: orgId,
      action: "USER_INVITED",
      affectedRecordIds: [invitationId],
      metadata: { email, role },
    });
  }

  /**
   * Log membership activation (called after Better Auth activates membership)
   * 
   * @param membershipId - Membership ID
   * @param orgId - Organization ID
   * @param userId - User ID
   * @param email - User email
   * @param role - Role assigned
   * 
   */
  async logMembershipActivation(
    membershipId: string,
    orgId: string,
    userId: string,
    email: string,
    role: string
  ): Promise<void> {
    await auditService.log({
      userId,
      organizationId: orgId,
      action: "MEMBERSHIP_ACTIVATED",
      affectedRecordIds: [membershipId],
      metadata: { email, role },
    });
  }

  /**
   * Update a member's role (admin only)
   * 
   * Updates member role within a transaction to ensure atomicity with audit logging.
   * Better Auth may handle role updates, but this provides additional validation
   * and audit logging.
   * 
   * @param membershipId - Membership ID to update
   * @param newRole - New role to assign
   * @param requesterId - User ID making the request
   * @param orgId - Organization ID
   * @returns Updated membership
   * @throws {AppError} if requester is not an admin
   * 
   * Requirements: 2.3, 2.4
   */
  async updateMemberRole(
    membershipId: string,
    newRole: "admin" | "member" | "viewer",
    requesterId: string,
    orgId: string
  ): Promise<typeof member.$inferSelect> {
    // Use transaction to ensure atomicity
    return await withTransaction(async (tx) => {
      // Verify requester is an admin
      const requesterMembership = await tx
        .select()
        .from(member)
        .where(
          and(eq(member.userId, requesterId), eq(member.organizationId, orgId))
        )
        .limit(1);

      if (requesterMembership.length === 0 || requesterMembership[0]?.role !== "admin") {
        throw new AppError(
          ErrorCodes.AUTHZ_ADMIN_ROLE_REQUIRED,
          "Only admins can update member roles",
          403
        );
      }

      // Fetch the membership to update
      const membershipToUpdate = await tx
        .select()
        .from(member)
        .where(eq(member.id, membershipId))
        .limit(1);

      if (membershipToUpdate.length === 0) {
        throw new AppError(
          ErrorCodes.RES_NOT_FOUND,
          "Membership not found",
          404
        );
      }

      // Verify membership belongs to the organization
      if (membershipToUpdate[0]?.organizationId !== orgId) {
        throw new AppError(
          ErrorCodes.AUTHZ_ORGANIZATION_ACCESS_DENIED,
          "Membership does not belong to this organization",
          403
        );
      }

      const oldRole = membershipToUpdate[0].role;

      // Update the role
      await tx
        .update(member)
        .set({ role: newRole })
        .where(eq(member.id, membershipId));

      // Log the role change (within transaction)
      await auditService.log({
        userId: requesterId,
        organizationId: orgId,
        action: "ROLE_CHANGED",
        affectedRecordIds: [membershipId],
        metadata: { oldRole, newRole, targetUserId: membershipToUpdate[0].userId },
      }, tx);

      // Fetch and return updated membership
      const updated = await tx
        .select()
        .from(member)
        .where(eq(member.id, membershipId))
        .limit(1);

      if (!updated[0]) {
        throw new AppError(
          ErrorCodes.SRV_INTERNAL_ERROR,
          "Failed to update membership",
          500
        );
      }

      return updated[0];
    });
  }

  /**
   * List all members of an organization
   * 
   * @param orgId - Organization ID
   * @param userId - User ID making the request
   * @returns Array of members with user information
   * 
   */
  async listMembers(
    orgId: string,
    userId: string
  ): Promise<Array<typeof member.$inferSelect>> {
    // Verify user has access to this organization
    const membership = await db
      .select()
      .from(member)
      .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
      .limit(1);

    if (membership.length === 0) {
      throw new AppError(
        ErrorCodes.AUTHZ_ORGANIZATION_ACCESS_DENIED,
        "Organization not found or access denied",
        403
      );
    }

    // Fetch all members
    const members = await db
      .select()
      .from(member)
      .where(eq(member.organizationId, orgId));

    return members;
  }
}

// Export singleton instance
export const organizationService = new OrganizationService();

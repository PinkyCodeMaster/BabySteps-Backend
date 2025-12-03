import { user } from "../db/schema/users";
import { eq } from "drizzle-orm";
import { withTransaction } from "../db/transaction";
import { AppError, ErrorCodes } from "../middleware/errorHandler.middleware";
import { logger } from '../lib/logger';

/**
 * Deletion Service
 * 
 * Provides functionality for user account deletion with soft delete
 * and anonymization for GDPR compliance.
 * 
 * Requirements: 10.1
 */

/**
 * Deletion result structure
 */
export interface DeletionResult {
  userId: string;
  deletedAt: string;
  scheduledHardDeleteAt: string;
  message: string;
}

export class DeletionService {
  /**
   * Soft delete a user account
   * 
   * Marks the user as deleted and anonymizes their email.
   * The account is scheduled for hard deletion after 30 days.
   * 
   * Process:
   * 1. Mark user as banned (soft delete)
   * 2. Anonymize email to prevent login
   * 3. Set ban reason and expiry (30 days for hard delete)
   * 4. Create audit log entry
   * 
   * @param userId - User ID to delete
   * @param requesterId - User ID making the request
   * @returns Deletion confirmation
   * @throws {AppError} if user not found
   * 
   * Requirements: 10.1
   */
  async softDeleteUser(
    userId: string,
    requesterId: string
  ): Promise<DeletionResult> {
    return await withTransaction(async (tx) => {
      // Fetch the user to delete
      const [userToDelete] = await tx
        .select()
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

      if (!userToDelete) {
        throw new AppError(
          ErrorCodes.RES_NOT_FOUND,
          "User not found",
          404
        );
      }

      // Check if user is already deleted
      if (userToDelete.banned && userToDelete.banReason === "ACCOUNT_DELETED") {
        throw new AppError(
          ErrorCodes.RES_CONFLICT,
          "User account is already deleted",
          409
        );
      }

      // Calculate hard delete date (30 days from now)
      const hardDeleteDate = new Date();
      hardDeleteDate.setDate(hardDeleteDate.getDate() + 30);

      // Anonymize email to prevent login
      const anonymizedEmail = `deleted-${userId}@deleted.local`;

      // Update user: mark as banned and anonymize email
      await tx
        .update(user)
        .set({
          banned: true,
          banReason: "ACCOUNT_DELETED",
          banExpires: hardDeleteDate,
          email: anonymizedEmail,
        })
        .where(eq(user.id, userId));

      // Log user deletion (not using audit log since it requires organizationId)
      // The deletion is tracked via the user's banned status and anonymized email
      logger.info({
        userId,
        requesterId,
        originalEmail: userToDelete.email,
        anonymizedEmail,
        scheduledHardDeleteAt: hardDeleteDate.toISOString(),
      }, "User deletion completed");

      return {
        userId,
        deletedAt: new Date().toISOString(),
        scheduledHardDeleteAt: hardDeleteDate.toISOString(),
        message: "User account has been marked for deletion. The account will be permanently deleted after 30 days.",
      };
    });
  }

  /**
   * Check if a user can be deleted by the requester
   * 
   * A user can be deleted if:
   * - The requester is deleting their own account, OR
   * - The requester is an admin in any organization the user belongs to
   * 
   * @param userId - User ID to delete
   * @param requesterId - User ID making the request
   * @returns true if deletion is allowed
   */
  async canDeleteUser(userId: string, requesterId: string): Promise<boolean> {
    // Users can always delete their own account
    if (userId === requesterId) {
      return true;
    }

    // TODO: Check if requester is an admin in any shared organization
    // For now, only allow self-deletion
    // This can be enhanced in the future to allow org admins to delete members
    
    return false;
  }
}

// Export singleton instance
export const deletionService = new DeletionService();

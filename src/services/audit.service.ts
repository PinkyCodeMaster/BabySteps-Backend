import { db } from '../db';
import { auditLog } from '../db/schema/auditLogs';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { logger } from '../lib/logger';

/**
 * Audit log entry data structure
 */
export interface AuditLogEntry {
  userId: string;
  organizationId: string;
  action: string;
  affectedRecordIds: string[];
  metadata: Record<string, any>;
}

/**
 * Audit Service
 * 
 * Provides functionality for logging sensitive operations to the audit log.
 * All logged actions include userId, organizationId, action type, affected record IDs,
 * metadata, and timestamp.
 * 
 * Logged actions include:
 * - User invited
 * - Membership activated
 * - Role changed
 * - Debt marked paid
 * - Debt status changed
 * - Organization created
 * - Payment recorded
 * - Data exported
 */
export class AuditService {
  /**
   * Log an audit entry to the database
   * 
   * @param entry - The audit log entry data
   * @param tx - Optional transaction context for atomic operations
   * @returns Promise that resolves when the log is written
   * 
   * @example
   * await auditService.log({
   *   userId: 'user-123',
   *   organizationId: 'org-456',
   *   action: 'PAYMENT_RECORDED',
   *   affectedRecordIds: ['debt-789'],
   *   metadata: { amount: 100.00, previousBalance: 1000.00, newBalance: 900.00 }
   * });
   */
  async log(entry: AuditLogEntry, tx?: NeonHttpDatabase): Promise<void> {
    try {
      const dbClient = tx || db;
      await dbClient.insert(auditLog).values({
        id: crypto.randomUUID(),
        userId: entry.userId,
        organizationId: entry.organizationId,
        action: entry.action,
        affectedRecordIds: entry.affectedRecordIds,
        metadata: entry.metadata,
      });
    } catch (error) {
      // Log the error but don't throw - audit logging should not break the main operation
      logger.error({
        err: error,
        entry,
      }, 'Failed to write audit log');
    }
  }
}

// Export singleton instance
export const auditService = new AuditService();

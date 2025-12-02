// Load test environment variables first
import '../../../scripts/load-test-env';

import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'bun:test';
import { db } from '../../db';
import { auditLog } from '../../db/schema/auditLogs';
import { user, organization } from '../../db/schema/users';
import { auditService, AuditLogEntry } from '../../services/audit.service';
import { eq } from 'drizzle-orm';

/**
 * Audit Service Tests
 * 
 * IMPORTANT: These tests require a SEPARATE TEST DATABASE.
 * Do NOT run these tests against your development or production database!
 * 
 * Setup:
 * 1. Create a test database or Neon branch
 * 2. Copy .env.test to .env.test.local and add your test database URL
 * 3. Run migrations: bun run db:push:test
 * 4. Run tests: bun test src/services/audit.service.test.ts
 * 
 * See src/services/README.md or TESTING_SETUP.md for detailed setup instructions.
 */
describe('AuditService', () => {
  let testUserId: string;
  let testOrgId: string;

  beforeAll(async () => {
    // Ensure DATABASE_URL is set for tests
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set for audit service tests');
    }

    // Create test user and organization
    testUserId = crypto.randomUUID();
    testOrgId = crypto.randomUUID();

    await db.insert(user).values({
      id: testUserId,
      name: 'Test User',
      email: `test-${testUserId}@example.com`,
      emailVerified: false,
    });

    await db.insert(organization).values({
      id: testOrgId,
      name: 'Test Organization',
      slug: `test-org-${testOrgId}`,
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(auditLog).where(eq(auditLog.userId, testUserId));
    await db.delete(organization).where(eq(organization.id, testOrgId));
    await db.delete(user).where(eq(user.id, testUserId));
  });

  // Clean up audit logs before each test
  beforeEach(async () => {
    await db.delete(auditLog).where(eq(auditLog.userId, testUserId));
  });

  test('should log an audit entry to the database', async () => {
    // Arrange
    const entry: AuditLogEntry = {
      userId: testUserId,
      organizationId: testOrgId,
      action: 'PAYMENT_RECORDED',
      affectedRecordIds: ['debt-789'],
      metadata: {
        amount: 100.0,
        previousBalance: 1000.0,
        newBalance: 900.0,
      },
    };

    // Act
    await auditService.log(entry);

    // Assert
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, entry.userId));

    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(entry.userId);
    expect(logs[0].organizationId).toBe(entry.organizationId);
    expect(logs[0].action).toBe(entry.action);
    expect(logs[0].affectedRecordIds).toEqual(entry.affectedRecordIds);
    expect(logs[0].metadata).toEqual(entry.metadata);
    expect(logs[0].timestamp).toBeInstanceOf(Date);
    expect(logs[0].id).toBeTruthy();
  });

  test('should log multiple audit entries', async () => {
    // Arrange
    const entries: AuditLogEntry[] = [
      {
        userId: testUserId,
        organizationId: testOrgId,
        action: 'USER_INVITED',
        affectedRecordIds: ['invitation-1'],
        metadata: { email: 'test@example.com', role: 'member' },
      },
      {
        userId: testUserId,
        organizationId: testOrgId,
        action: 'ROLE_CHANGED',
        affectedRecordIds: ['member-2'],
        metadata: { oldRole: 'member', newRole: 'admin' },
      },
    ];

    // Act
    for (const entry of entries) {
      await auditService.log(entry);
    }

    // Assert
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.organizationId, testOrgId));

    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.action)).toContain('USER_INVITED');
    expect(logs.map((l) => l.action)).toContain('ROLE_CHANGED');
  });

  test('should handle empty affectedRecordIds array', async () => {
    // Arrange
    const entry: AuditLogEntry = {
      userId: testUserId,
      organizationId: testOrgId,
      action: 'ORGANIZATION_CREATED',
      affectedRecordIds: [],
      metadata: { name: 'Test Org' },
    };

    // Act
    await auditService.log(entry);

    // Assert
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'ORGANIZATION_CREATED'));

    expect(logs).toHaveLength(1);
    expect(logs[0].affectedRecordIds).toEqual([]);
  });

  test('should handle empty metadata object', async () => {
    // Arrange
    const entry: AuditLogEntry = {
      userId: testUserId,
      organizationId: testOrgId,
      action: 'DATA_EXPORTED',
      affectedRecordIds: ['export-1'],
      metadata: {},
    };

    // Act
    await auditService.log(entry);

    // Assert
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'DATA_EXPORTED'));

    expect(logs).toHaveLength(1);
    expect(logs[0].metadata).toEqual({});
  });

  test('should handle complex metadata', async () => {
    // Arrange
    const entry: AuditLogEntry = {
      userId: testUserId,
      organizationId: testOrgId,
      action: 'DEBT_STATUS_CHANGED',
      affectedRecordIds: ['debt-1'],
      metadata: {
        oldStatus: 'active',
        newStatus: 'paid',
        finalBalance: 0,
        totalPaid: 5000.0,
        paymentHistory: [
          { date: '2025-01-01', amount: 1000 },
          { date: '2025-02-01', amount: 1000 },
        ],
      },
    };

    // Act
    await auditService.log(entry);

    // Assert
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'DEBT_STATUS_CHANGED'));

    expect(logs).toHaveLength(1);
    expect(logs[0].metadata).toEqual(entry.metadata);
  });

  test('should handle multiple affected record IDs', async () => {
    // Arrange
    const entry: AuditLogEntry = {
      userId: testUserId,
      organizationId: testOrgId,
      action: 'MEMBERSHIP_ACTIVATED',
      affectedRecordIds: ['member-1', 'invitation-1', 'user-1'],
      metadata: { email: 'newuser@example.com' },
    };

    // Act
    await auditService.log(entry);

    // Assert
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'MEMBERSHIP_ACTIVATED'));

    expect(logs).toHaveLength(1);
    expect(logs[0].affectedRecordIds).toHaveLength(3);
    expect(logs[0].affectedRecordIds).toContain('member-1');
    expect(logs[0].affectedRecordIds).toContain('invitation-1');
    expect(logs[0].affectedRecordIds).toContain('user-1');
  });
});

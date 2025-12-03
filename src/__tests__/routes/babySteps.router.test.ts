import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { db } from "../../db";
import { babyStep } from "../../db/schema/babySteps";
import { debt } from "../../db/schema/debts";
import { eq } from "drizzle-orm";
import app from "../../app";
import {
  createTestContext,
  cleanupTestContext,
  type TestContext,
} from "../helpers/testSetup";

/**
 * Integration Tests for Baby Steps Router
 * 
 * Tests the Baby Steps REST endpoints:
 * - GET /api/v1/orgs/:orgId/baby-steps
 * - PATCH /api/v1/orgs/:orgId/baby-steps
 * 
 * Requirements: 8.1, 8.6
 */

describe.skip("Baby Steps Router - Integration Tests", () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestContext();
  });

  afterAll(async () => {
    await cleanupTestContext(context);
  });

  beforeEach(async () => {
    // Clean up baby steps and debts before each test
    await db.delete(babyStep).where(eq(babyStep.organizationId, context.testOrg.orgId));
    await db.delete(babyStep).where(eq(babyStep.organizationId, context.otherOrg.orgId));
    await db.delete(debt).where(eq(debt.organizationId, context.testOrg.orgId));
    await db.delete(debt).where(eq(debt.organizationId, context.otherOrg.orgId));
  });

  describe("GET /api/v1/orgs/:orgId/baby-steps", () => {
    test("Returns Baby Steps status for organization", async () => {
      const res = await app.request(
        `/api/v1/orgs/${context.testOrg.orgId}/baby-steps`,
        {
          headers: {
            Cookie: context.testOrg.sessionCookie,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.organizationId).toBe(context.testOrg.orgId);
      expect(data.currentStep).toBe(1);
      expect(data.stepProgress).toBeDefined();
      expect(data.updatedAt).toBeDefined();
    });

    test("Returns 403 when accessing another organization", async () => {
      const res = await app.request(
        `/api/v1/orgs/${context.otherOrg.orgId}/baby-steps`,
        {
          headers: {
            Cookie: context.testOrg.sessionCookie,
          },
        }
      );

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("AUTHZ_002");
    });

    test("Returns 401 when not authenticated", async () => {
      const res = await app.request(
        `/api/v1/orgs/${context.testOrg.orgId}/baby-steps`
      );

      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/v1/orgs/:orgId/baby-steps", () => {
    test("Updates Baby Steps progress", async () => {
      const res = await app.request(
        `/api/v1/orgs/${context.testOrg.orgId}/baby-steps`,
        {
          method: "PATCH",
          headers: {
            Cookie: context.testOrg.sessionCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stepProgress: {
              emergencyFundSaved: 500,
            },
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.organizationId).toBe(context.testOrg.orgId);
      expect(data.currentStep).toBe(1);
      expect(data.stepProgress.emergencyFundSaved).toBe(500);
    });

    test("Allows advancing to step 2 when requirements met", async () => {
      // First, set emergency fund to 1000
      await app.request(
        `/api/v1/orgs/${context.testOrg.orgId}/baby-steps`,
        {
          method: "PATCH",
          headers: {
            Cookie: context.testOrg.sessionCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stepProgress: {
              emergencyFundSaved: 1000,
            },
          }),
        }
      );

      // Now advance to step 2
      const res = await app.request(
        `/api/v1/orgs/${context.testOrg.orgId}/baby-steps`,
        {
          method: "PATCH",
          headers: {
            Cookie: context.testOrg.sessionCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            currentStep: 2,
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.currentStep).toBe(2);
    });

    test("Rejects advancing to step 2 when requirements not met", async () => {
      const res = await app.request(
        `/api/v1/orgs/${context.testOrg.orgId}/baby-steps`,
        {
          method: "PATCH",
          headers: {
            Cookie: context.testOrg.sessionCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            currentStep: 2,
          }),
        }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("Rejects negative emergency fund amounts", async () => {
      const res = await app.request(
        `/api/v1/orgs/${context.testOrg.orgId}/baby-steps`,
        {
          method: "PATCH",
          headers: {
            Cookie: context.testOrg.sessionCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stepProgress: {
              emergencyFundSaved: -100,
            },
          }),
        }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("Rejects invalid target months", async () => {
      const res = await app.request(
        `/api/v1/orgs/${context.testOrg.orgId}/baby-steps`,
        {
          method: "PATCH",
          headers: {
            Cookie: context.testOrg.sessionCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stepProgress: {
              targetMonths: 10,
            },
          }),
        }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("Returns 403 when accessing another organization", async () => {
      const res = await app.request(
        `/api/v1/orgs/${context.otherOrg.orgId}/baby-steps`,
        {
          method: "PATCH",
          headers: {
            Cookie: context.testOrg.sessionCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stepProgress: {
              emergencyFundSaved: 500,
            },
          }),
        }
      );

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("AUTHZ_002");
    });

    test("Returns 401 when not authenticated", async () => {
      const res = await app.request(
        `/api/v1/orgs/${context.testOrg.orgId}/baby-steps`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stepProgress: {
              emergencyFundSaved: 500,
            },
          }),
        }
      );

      expect(res.status).toBe(401);
    });
  });
});

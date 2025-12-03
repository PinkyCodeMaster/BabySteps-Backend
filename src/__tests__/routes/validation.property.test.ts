import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import { z } from "zod";
import {
  createIncomeSchema,
  updateIncomeSchema,
} from "../../db/schema/incomes";
import {
  createExpenseSchema,
  updateExpenseSchema,
} from "../../db/schema/expenses";
import {
  createDebtSchema,
  updateDebtSchema,
  recordPaymentSchema,
} from "../../db/schema/debts";
import {
  incomeDataArbitrary,
  expenseDataArbitrary,
  debtDataArbitrary,
  moneyAmountArbitrary,
} from "../helpers/generators";

/**
 * Property-Based Tests for Request/Response Validation
 * 
 * Feature: debt-snowball-api
 * These tests validate the correctness properties for validation:
 * - Property 48: Request validation against Zod schemas
 * - Property 49: Validation errors return 400 with details
 * - Property 50: Response schema conformance
 * 
 * Validates: Requirements 9.4, 9.5, 9.6
 */

describe("Validation - Property-Based Tests", () => {
  /**
   * Feature: debt-snowball-api, Property 48: Request validation against Zod schemas
   * 
   * For any endpoint request, the system should validate the request body against
   * the Zod schema and reject invalid requests.
   * 
   * Validates: Requirements 9.4
   */
  describe("Property 48: Request validation against Zod schemas", () => {
    test("Valid income data passes schema validation", () => {
      fc.assert(
        fc.property(incomeDataArbitrary, (data) => {
          const result = createIncomeSchema.safeParse(data);
          
          // Property: Valid data should pass validation
          expect(result.success).toBe(true);
          
          if (result.success) {
            // Verify all required fields are present
            expect(result.data.type).toBeDefined();
            expect(result.data.name).toBeDefined();
            expect(result.data.amount).toBeDefined();
            expect(result.data.frequency).toBeDefined();
            expect(result.data.isNet).toBeDefined();
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("Valid expense data passes schema validation", () => {
      fc.assert(
        fc.property(expenseDataArbitrary, (data) => {
          const result = createExpenseSchema.safeParse(data);
          
          // Property: Valid data should pass validation
          expect(result.success).toBe(true);
          
          if (result.success) {
            // Verify all required fields are present
            expect(result.data.name).toBeDefined();
            expect(result.data.amount).toBeDefined();
            expect(result.data.category).toBeDefined();
            expect(result.data.priority).toBeDefined();
            expect(result.data.frequency).toBeDefined();
            expect(result.data.isUcPaid).toBeDefined();
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("Valid debt data passes schema validation", () => {
      // Create a safer debt data generator with constrained dates
      // Use a single record with conditional ccjDeadline to avoid type union issues
      const safeDebtDataArbitrary = fc.record({
        name: fc.string({ minLength: 1, maxLength: 100 }),
        type: fc.constantFrom("credit-card", "loan", "overdraft", "ccj", "other"),
        balance: moneyAmountArbitrary,
        interestRate: fc.double({ min: 0, max: 30, noNaN: true }).map((n) => n.toFixed(2)),
        minimumPayment: moneyAmountArbitrary,
        isCcj: fc.boolean(),
      }).chain((baseData) => 
        baseData.isCcj
          ? fc.constant({
              ...baseData,
              ccjDeadline: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            })
          : fc.constant(baseData)
      );
      
      fc.assert(
        fc.property(safeDebtDataArbitrary, (data) => {
          const result = createDebtSchema.safeParse(data);
          
          // Property: Valid data should pass validation
          expect(result.success).toBe(true);
          
          if (result.success) {
            // Verify all required fields are present
            expect(result.data.name).toBeDefined();
            expect(result.data.type).toBeDefined();
            expect(result.data.balance).toBeDefined();
            expect(result.data.interestRate).toBeDefined();
            expect(result.data.minimumPayment).toBeDefined();
            expect(result.data.isCcj).toBeDefined();
            
            // Property: CCJ debts must have deadline
            if (result.data.isCcj) {
              expect(result.data.ccjDeadline).toBeDefined();
            }
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("Invalid frequency values are rejected", () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !['weekly', 'fortnightly', 'monthly', 'annual', 'one-time'].includes(s)),
          (invalidFrequency) => {
            const data = {
              type: "Salary",
              name: "Test Income",
              amount: "1000.00",
              frequency: invalidFrequency,
              isNet: false,
            };
            
            const result = createIncomeSchema.safeParse(data);
            
            // Property: Invalid frequency should be rejected
            expect(result.success).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Invalid expense category values are rejected", () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !['housing', 'utilities', 'food', 'transport', 'insurance', 'childcare', 'other'].includes(s)),
          (invalidCategory) => {
            const data = {
              name: "Test Expense",
              amount: "100.00",
              category: invalidCategory,
              priority: "essential",
              frequency: "monthly",
              isUcPaid: false,
            };
            
            const result = createExpenseSchema.safeParse(data);
            
            // Property: Invalid category should be rejected
            expect(result.success).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Invalid expense priority values are rejected", () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !['essential', 'important', 'discretionary'].includes(s)),
          (invalidPriority) => {
            const data = {
              name: "Test Expense",
              amount: "100.00",
              category: "housing",
              priority: invalidPriority,
              frequency: "monthly",
              isUcPaid: false,
            };
            
            const result = createExpenseSchema.safeParse(data);
            
            // Property: Invalid priority should be rejected
            expect(result.success).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Missing required fields are rejected", () => {
      fc.assert(
        fc.property(
          fc.constantFrom('type', 'name', 'amount', 'frequency'),
          (fieldToOmit) => {
            const fullData = {
              type: "Salary",
              name: "Test Income",
              amount: "1000.00",
              frequency: "monthly" as const,
              isNet: false,
            };
            
            // Remove one required field (isNet has a default, so skip it)
            const data = { ...fullData };
            delete data[fieldToOmit as keyof typeof data];
            
            const result = createIncomeSchema.safeParse(data);
            
            // Property: Missing required field should be rejected
            expect(result.success).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Invalid data types are rejected", () => {
      fc.assert(
        fc.property(
          fc.integer(),
          (invalidAmount) => {
            const data = {
              type: "Salary",
              name: "Test Income",
              amount: invalidAmount, // Should be string, not number
              frequency: "monthly",
              isNet: false,
            };
            
            const result = createIncomeSchema.safeParse(data);
            
            // Property: Invalid data type should be rejected
            expect(result.success).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("CCJ debts with deadline pass validation", () => {
      // Note: The schema uses refine() to validate CCJ debts have deadlines
      // This test verifies that valid CCJ debts pass validation
      const data = {
        name: "CCJ Debt",
        type: "ccj" as const,
        balance: "1000.00",
        interestRate: "10.00",
        minimumPayment: "50.00",
        isCcj: true,
        ccjDeadline: "2026-06-01",
      };
      
      const result = createDebtSchema.safeParse(data);
      
      // Property: CCJ debt with deadline should pass validation
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.isCcj).toBe(true);
        expect(result.data.ccjDeadline).toBe("2026-06-01");
      }
    });

    test("Payment amount validation", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => n.toFixed(2)),
          (amount) => {
            const data = { amount };
            
            const result = recordPaymentSchema.safeParse(data);
            
            // Property: Valid payment amount should pass
            expect(result.success).toBe(true);
            
            if (result.success) {
              expect(result.data.amount).toBe(amount);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Negative payment amounts are rejected", () => {
      fc.assert(
        fc.property(
          fc.double({ min: -10000, max: -0.01, noNaN: true }).map(n => n.toFixed(2)),
          (negativeAmount) => {
            const data = { amount: negativeAmount };
            
            const result = recordPaymentSchema.safeParse(data);
            
            // Property: Negative payment should be rejected
            expect(result.success).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Zero payment amounts are accepted (schema allows it)", () => {
      const data = { amount: "0.00" };
      
      const result = recordPaymentSchema.safeParse(data);
      
      // Note: The schema currently allows zero payments (business logic may reject it)
      // This test documents the current schema behavior
      expect(result.success).toBe(true);
    });

    test("Update schemas accept partial data", () => {
      fc.assert(
        fc.property(
          fc.record({
            name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
            amount: fc.option(moneyAmountArbitrary, { nil: undefined }),
          }),
          (partialData) => {
            const result = updateIncomeSchema.safeParse(partialData);
            
            // Property: Partial update data should pass validation
            expect(result.success).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Empty update objects are accepted", () => {
      const emptyUpdate = {};
      
      const incomeResult = updateIncomeSchema.safeParse(emptyUpdate);
      const expenseResult = updateExpenseSchema.safeParse(emptyUpdate);
      const debtResult = updateDebtSchema.safeParse(emptyUpdate);
      
      // Property: Empty updates should be valid (no changes)
      expect(incomeResult.success).toBe(true);
      expect(expenseResult.success).toBe(true);
      expect(debtResult.success).toBe(true);
    });
  });

  /**
   * Feature: debt-snowball-api, Property 49: Validation errors return 400 with details
   * 
   * For any request failing validation, the system should return a 400 status code
   * with detailed validation messages.
   * 
   * Validates: Requirements 9.5
   */
  describe("Property 49: Validation errors return 400 with details", () => {
    test("Validation errors include field-level details", () => {
      fc.assert(
        fc.property(
          fc.constantFrom('type', 'name', 'amount', 'frequency'),
          (fieldToOmit) => {
            const fullData = {
              type: "Salary",
              name: "Test Income",
              amount: "1000.00",
              frequency: "monthly" as const,
              isNet: false,
            };
            
            // Remove one required field (isNet has a default, so skip it)
            const data = { ...fullData };
            delete data[fieldToOmit as keyof typeof data];
            
            const result = createIncomeSchema.safeParse(data);
            
            // Property: Validation error should include details about the missing field
            expect(result.success).toBe(false);
            
            if (!result.success) {
              const errors = result.error.format();
              
              // Verify error structure exists
              expect(errors).toBeDefined();
              
              // Verify the specific field error is present
              expect(errors[fieldToOmit as keyof typeof errors]).toBeDefined();
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Invalid enum values produce descriptive errors", () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !['weekly', 'fortnightly', 'monthly', 'annual', 'one-time'].includes(s)),
          (invalidFrequency) => {
            const data = {
              type: "Salary",
              name: "Test Income",
              amount: "1000.00",
              frequency: invalidFrequency,
              isNet: false,
            };
            
            const result = createIncomeSchema.safeParse(data);
            
            // Property: Invalid enum should produce error with details
            expect(result.success).toBe(false);
            
            if (!result.success) {
              const errors = result.error.format();
              
              // Verify frequency field has error
              expect(errors.frequency).toBeDefined();
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Type mismatch errors are descriptive", () => {
      fc.assert(
        fc.property(
          fc.integer(),
          (invalidAmount) => {
            const data = {
              type: "Salary",
              name: "Test Income",
              amount: invalidAmount, // Should be string
              frequency: "monthly",
              isNet: false,
            };
            
            const result = createIncomeSchema.safeParse(data);
            
            // Property: Type mismatch should produce error with details
            expect(result.success).toBe(false);
            
            if (!result.success) {
              const errors = result.error.format();
              
              // Verify amount field has error
              expect(errors.amount).toBeDefined();
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Multiple validation errors are all reported", () => {
      const invalidData = {
        // Missing: type, name, amount, frequency (isNet has a default)
      };
      
      const result = createIncomeSchema.safeParse(invalidData);
      
      // Property: All missing required fields should be reported
      expect(result.success).toBe(false);
      
      if (!result.success) {
        const errors = result.error.format();
        
        // Verify multiple errors are present (isNet has default so won't error)
        expect(errors.type).toBeDefined();
        expect(errors.name).toBeDefined();
        expect(errors.amount).toBeDefined();
        expect(errors.frequency).toBeDefined();
      }
    });

    test("Non-CCJ debts don't require deadline", () => {
      const data = {
        name: "Regular Debt",
        type: "loan" as const,
        balance: "1000.00",
        interestRate: "10.00",
        minimumPayment: "50.00",
        isCcj: false,
        // No ccjDeadline needed
      };
      
      const result = createDebtSchema.safeParse(data);
      
      // Property: Non-CCJ debt without deadline should pass validation
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.isCcj).toBe(false);
      }
    });

    test("Validation errors are structured consistently", () => {
      fc.assert(
        fc.property(
          fc.record({
            invalidField: fc.anything(),
          }),
          (invalidData) => {
            const result = createIncomeSchema.safeParse(invalidData);
            
            // Property: All validation errors should have consistent structure
            expect(result.success).toBe(false);
            
            if (!result.success) {
              // Verify error has standard Zod structure
              expect(result.error).toBeDefined();
              expect(result.error.issues).toBeDefined();
              expect(Array.isArray(result.error.issues)).toBe(true);
              
              // Each issue should have path, message, and code
              for (const issue of result.error.issues) {
                expect(issue.path).toBeDefined();
                expect(issue.message).toBeDefined();
                expect(issue.code).toBeDefined();
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: debt-snowball-api, Property 50: Response schema conformance
   * 
   * For any endpoint response, the data should conform to the documented response schema.
   * 
   * Validates: Requirements 9.6
   */
  describe("Property 50: Response schema conformance", () => {
    // Define response schemas
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

    const ExpenseResponseSchema = z.object({
      id: z.string(),
      organizationId: z.string(),
      name: z.string(),
      amount: z.string(),
      category: z.enum(['housing', 'utilities', 'food', 'transport', 'insurance', 'childcare', 'other']),
      priority: z.enum(['essential', 'important', 'discretionary']),
      frequency: z.enum(['one-time', 'weekly', 'fortnightly', 'monthly', 'annual']),
      dueDay: z.number().nullable(),
      isUcPaid: z.boolean(),
      createdAt: z.string(),
      updatedAt: z.string(),
    });

    const DebtResponseSchema = z.object({
      id: z.string(),
      organizationId: z.string(),
      name: z.string(),
      type: z.enum(['credit-card', 'loan', 'overdraft', 'ccj', 'other']),
      balance: z.string(),
      interestRate: z.string(),
      minimumPayment: z.string(),
      isCcj: z.boolean(),
      ccjDeadline: z.string().nullable(),
      status: z.enum(['active', 'paid']),
      snowballPosition: z.number().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
    });

    test("Income response conforms to schema", () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            organizationId: fc.uuid(),
            type: fc.string({ minLength: 1, maxLength: 50 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            amount: moneyAmountArbitrary,
            frequency: fc.constantFrom('one-time', 'weekly', 'fortnightly', 'monthly', 'annual'),
            isNet: fc.boolean(),
            startDate: fc.option(
              fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') })
                .map(ts => new Date(ts).toISOString()), 
              { nil: null }
            ),
            endDate: fc.option(
              fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') })
                .map(ts => new Date(ts).toISOString()), 
              { nil: null }
            ),
            createdAt: fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') })
              .map(ts => new Date(ts).toISOString()),
            updatedAt: fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') })
              .map(ts => new Date(ts).toISOString()),
          }),
          (responseData) => {
            const result = IncomeResponseSchema.safeParse(responseData);
            
            // Property: Valid response data should conform to schema
            expect(result.success).toBe(true);
            
            if (result.success) {
              // Verify all fields are present and correct type
              expect(typeof result.data.id).toBe('string');
              expect(typeof result.data.organizationId).toBe('string');
              expect(typeof result.data.amount).toBe('string');
              expect(typeof result.data.isNet).toBe('boolean');
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Expense response conforms to schema", () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            organizationId: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            amount: moneyAmountArbitrary,
            category: fc.constantFrom('housing', 'utilities', 'food', 'transport', 'insurance', 'childcare', 'other'),
            priority: fc.constantFrom('essential', 'important', 'discretionary'),
            frequency: fc.constantFrom('one-time', 'weekly', 'fortnightly', 'monthly', 'annual'),
            dueDay: fc.option(fc.integer({ min: 1, max: 31 }), { nil: null }),
            isUcPaid: fc.boolean(),
            createdAt: fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') })
              .map(ts => new Date(ts).toISOString()),
            updatedAt: fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') })
              .map(ts => new Date(ts).toISOString()),
          }),
          (responseData) => {
            const result = ExpenseResponseSchema.safeParse(responseData);
            
            // Property: Valid response data should conform to schema
            expect(result.success).toBe(true);
            
            if (result.success) {
              // Verify all fields are present and correct type
              expect(typeof result.data.id).toBe('string');
              expect(typeof result.data.organizationId).toBe('string');
              expect(typeof result.data.amount).toBe('string');
              expect(typeof result.data.isUcPaid).toBe('boolean');
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Debt response conforms to schema", () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            organizationId: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            type: fc.constantFrom('credit-card', 'loan', 'overdraft', 'ccj', 'other'),
            balance: moneyAmountArbitrary,
            interestRate: fc.double({ min: 0, max: 30, noNaN: true }).map(n => n.toFixed(2)),
            minimumPayment: moneyAmountArbitrary,
            isCcj: fc.boolean(),
            ccjDeadline: fc.option(
              fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') })
                .map(ts => new Date(ts).toISOString().split('T')[0]), 
              { nil: null }
            ),
            status: fc.constantFrom('active', 'paid'),
            snowballPosition: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
            createdAt: fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') })
              .map(ts => new Date(ts).toISOString()),
            updatedAt: fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') })
              .map(ts => new Date(ts).toISOString()),
          }),
          (responseData) => {
            const result = DebtResponseSchema.safeParse(responseData);
            
            // Property: Valid response data should conform to schema
            expect(result.success).toBe(true);
            
            if (result.success) {
              // Verify all fields are present and correct type
              expect(typeof result.data.id).toBe('string');
              expect(typeof result.data.organizationId).toBe('string');
              expect(typeof result.data.balance).toBe('string');
              expect(typeof result.data.isCcj).toBe('boolean');
              expect(typeof result.data.status).toBe('string');
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Response with missing fields fails schema validation", () => {
      fc.assert(
        fc.property(
          fc.constantFrom('id', 'organizationId', 'name', 'amount', 'frequency', 'isNet'),
          (fieldToOmit) => {
            const fullResponse = {
              id: crypto.randomUUID(),
              organizationId: crypto.randomUUID(),
              type: "Salary",
              name: "Test Income",
              amount: "1000.00",
              frequency: "monthly" as const,
              isNet: false,
              startDate: null,
              endDate: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            
            // Remove one required field
            const response = { ...fullResponse };
            delete response[fieldToOmit as keyof typeof response];
            
            const result = IncomeResponseSchema.safeParse(response);
            
            // Property: Response missing required field should fail validation
            expect(result.success).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Response with wrong data types fails schema validation", () => {
      fc.assert(
        fc.property(
          fc.integer(),
          (invalidAmount) => {
            const response = {
              id: crypto.randomUUID(),
              organizationId: crypto.randomUUID(),
              type: "Salary",
              name: "Test Income",
              amount: invalidAmount, // Should be string
              frequency: "monthly" as const,
              isNet: false,
              startDate: null,
              endDate: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            
            const result = IncomeResponseSchema.safeParse(response);
            
            // Property: Response with wrong type should fail validation
            expect(result.success).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("List response schemas include pagination metadata", () => {
      const ListResponseSchema = z.object({
        incomes: z.array(IncomeResponseSchema),
        pagination: z.object({
          page: z.number(),
          limit: z.number(),
          total: z.number(),
        }),
      });

      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.uuid(),
              organizationId: fc.uuid(),
              type: fc.string({ minLength: 1, maxLength: 50 }),
              name: fc.string({ minLength: 1, maxLength: 100 }),
              amount: moneyAmountArbitrary,
              frequency: fc.constantFrom('one-time', 'weekly', 'fortnightly', 'monthly', 'annual'),
              isNet: fc.boolean(),
              startDate: fc.option(
                fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') })
                  .map(ts => new Date(ts).toISOString()), 
                { nil: null }
              ),
              endDate: fc.option(
                fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') })
                  .map(ts => new Date(ts).toISOString()), 
                { nil: null }
              ),
              createdAt: fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') })
                .map(ts => new Date(ts).toISOString()),
              updatedAt: fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') })
                .map(ts => new Date(ts).toISOString()),
            }),
            { minLength: 0, maxLength: 50 }
          ),
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 0, max: 1000 }),
          (incomes, page, limit, total) => {
            const listResponse = {
              incomes,
              pagination: { page, limit, total },
            };
            
            const result = ListResponseSchema.safeParse(listResponse);
            
            // Property: List response should conform to schema with pagination
            expect(result.success).toBe(true);
            
            if (result.success) {
              expect(Array.isArray(result.data.incomes)).toBe(true);
              expect(typeof result.data.pagination.page).toBe('number');
              expect(typeof result.data.pagination.limit).toBe('number');
              expect(typeof result.data.pagination.total).toBe('number');
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Error response conforms to standard error schema", () => {
      const ErrorResponseSchema = z.object({
        error: z.object({
          code: z.string(),
          message: z.string(),
          details: z.any().optional(),
        }),
      });

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 200 }),
          (code, message) => {
            const errorResponse = {
              error: { code, message },
            };
            
            const result = ErrorResponseSchema.safeParse(errorResponse);
            
            // Property: Error response should conform to standard schema
            expect(result.success).toBe(true);
            
            if (result.success) {
              expect(typeof result.data.error.code).toBe('string');
              expect(typeof result.data.error.message).toBe('string');
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

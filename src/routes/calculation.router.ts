import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { authMiddleware, getAuthContext } from "../middleware/auth.middleware";
import { debtService } from "../services/debt.service";
import { incomeService } from "../services/income.service";
import { expenseService } from "../services/expense.service";
import { ucService } from "../services/uc.service";
import { snowballService } from "../services/snowball.service";
import { getCacheService } from "../services/cache.service";

/**
 * Calculation router
 * 
 * Provides REST endpoints for financial calculations including:
 * - Debt snowball order and payment schedule
 * - Debt-free date projection
 * - Disposable income calculation with UC taper
 * 
 * All endpoints require authentication and enforce organization-scoped access.
 * 
 * Endpoints:
 * - GET /orgs/:orgId/snowball - Get ordered debts with payment schedule
 * - GET /orgs/:orgId/debt-free-date - Get projected debt-free date
 * - GET /orgs/:orgId/disposable-income - Get disposable income after expenses and UC taper
 * 
 * Requirements: 6.1, 6.6, 7.3
 */
const calculationRouter = new OpenAPIHono();

// All calculation routes require authentication
calculationRouter.use("/*", authMiddleware);

// Common schemas
const OrgIdParamSchema = z.object({
  orgId: z.string().openapi({ example: 'org_123' }),
});

const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

/**
 * Response schema for snowball endpoint
 */
const SnowballResponseSchema = z.object({
  debts: z.array(
    z.object({
      debtId: z.string(),
      name: z.string(),
      balance: z.string(),
      minimumPayment: z.string(),
      monthlyPayment: z.string(),
      snowballPosition: z.number(),
    })
  ),
  totalMonthlyPayment: z.string(),
  disposableIncome: z.string(),
});

/**
 * Response schema for debt-free date endpoint
 */
const DebtFreeDateResponseSchema = z.object({
  debtFreeDate: z.string().nullable(),
  monthsToDebtFree: z.number().nullable(),
  totalMonthlyPayment: z.string(),
  disposableIncome: z.string(),
  schedule: z.array(
    z.object({
      month: z.number(),
      year: z.number(),
      debts: z.array(
        z.object({
          debtId: z.string(),
          name: z.string(),
          startingBalance: z.string(),
          interestCharged: z.string(),
          paymentApplied: z.string(),
          endingBalance: z.string(),
          isPaidOff: z.boolean(),
        })
      ),
    })
  ),
});

/**
 * Response schema for disposable income endpoint
 */
const DisposableIncomeResponseSchema = z.object({
  grossIncome: z.string(),
  totalExpenses: z.string(),
  ucTaper: z.string(),
  disposableIncome: z.string(),
});

/**
 * GET /orgs/:orgId/snowball
 * 
 * Returns the debt snowball order with payment schedule.
 * 
 * This endpoint:
 * 1. Fetches all active debts for the organization
 * 2. Orders them by snowball priority (CCJ by deadline, then non-CCJ by balance)
 * 3. Calculates disposable income (income - expenses - UC taper)
 * 4. Calculates monthly payment for each debt
 * 5. Returns the payment schedule
 * 
 * Requirements: 6.1
 * Property 30: CCJ debts prioritized by deadline
 * Property 31: Non-CCJ debts ordered by balance
 * Property 33: Monthly payment calculation
 */
const snowballRoute = createRoute({
  method: 'get',
  path: '/:orgId/snowball',
  tags: ['Calculations'],
  summary: 'Get debt snowball payment schedule',
  description: 'Returns debts ordered by snowball priority with calculated monthly payments',
  request: {
    params: OrgIdParamSchema,
  },
  responses: {
    200: {
      description: 'Snowball payment schedule',
      content: {
        'application/json': {
          schema: SnowballResponseSchema,
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

calculationRouter.openapi(snowballRoute, async (c) => {
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

  // Try to get from cache first
  const cacheService = getCacheService();
  const cacheKey = cacheService.getSnowballKey(orgId);
  
  if (cacheService.isEnabled()) {
    const cached = await cacheService.get<any>(cacheKey);
    if (cached) {
      return c.json(cached, 200);
    }
  }

  // Fetch active debts
  const activeDebts = await debtService.getActiveDebts(orgId);

  // Calculate disposable income
  const grossIncome = await incomeService.getMonthlyTotal(orgId);
  const totalExpenses = await expenseService.getMonthlyTotal(orgId, true); // Exclude UC-paid
  const ucTaper = await ucService.calculateTaperForIncome(grossIncome);
  const disposableIncome = grossIncome.minus(totalExpenses).minus(ucTaper);

  // Calculate snowball payment schedule
  const paymentSchedule = snowballService.calculateMonthlyPayments(
    activeDebts,
    disposableIncome
  );

  // Format response
  const response = {
    debts: paymentSchedule.debts.map((debt) => ({
      debtId: debt.debtId,
      name: debt.name,
      balance: debt.balance.toFixed(2),
      minimumPayment: debt.minimumPayment.toFixed(2),
      monthlyPayment: debt.monthlyPayment.toFixed(2),
      snowballPosition: debt.snowballPosition,
    })),
    totalMonthlyPayment: paymentSchedule.totalMonthlyPayment.toFixed(2),
    disposableIncome: disposableIncome.toFixed(2),
  };

  // Cache the result for 5 minutes (300 seconds)
  if (cacheService.isEnabled()) {
    await cacheService.set(cacheKey, response, 300);
  }

  return c.json(response, 200);
});

/**
 * GET /orgs/:orgId/debt-free-date
 * 
 * Returns the projected debt-free date with monthly schedule.
 * 
 * This endpoint:
 * 1. Fetches all active debts for the organization
 * 2. Calculates disposable income (income - expenses - UC taper)
 * 3. Projects the debt-free date by simulating monthly payments with interest
 * 4. Returns the date and detailed monthly schedule
 * 
 * Requirements: 6.6
 * Property 35: Debt-free date projection accuracy
 */
const debtFreeDateRoute = createRoute({
  method: 'get',
  path: '/:orgId/debt-free-date',
  tags: ['Calculations'],
  summary: 'Get projected debt-free date',
  description: 'Returns the projected debt-free date with detailed monthly payment schedule',
  request: {
    params: OrgIdParamSchema,
  },
  responses: {
    200: {
      description: 'Debt-free date projection',
      content: {
        'application/json': {
          schema: DebtFreeDateResponseSchema,
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

calculationRouter.openapi(debtFreeDateRoute, async (c) => {
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

  // Try to get from cache first
  const cacheService = getCacheService();
  const cacheKey = cacheService.getDebtFreeDateKey(orgId);
  
  if (cacheService.isEnabled()) {
    const cached = await cacheService.get<any>(cacheKey);
    if (cached) {
      return c.json(cached, 200);
    }
  }

  // Fetch active debts
  const activeDebts = await debtService.getActiveDebts(orgId);

  // Calculate disposable income
  const grossIncome = await incomeService.getMonthlyTotal(orgId);
  const totalExpenses = await expenseService.getMonthlyTotal(orgId, true); // Exclude UC-paid
  const ucTaper = await ucService.calculateTaperForIncome(grossIncome);
  const disposableIncome = grossIncome.minus(totalExpenses).minus(ucTaper);

  // Project debt-free date
  const projection = snowballService.projectDebtFreeDate(
    activeDebts,
    disposableIncome
  );

  // Format response
  const response = {
    debtFreeDate: projection.debtFreeDate ? projection.debtFreeDate.toISOString() : null,
    monthsToDebtFree: projection.monthsToDebtFree,
    totalMonthlyPayment: disposableIncome.toFixed(2),
    disposableIncome: disposableIncome.toFixed(2),
    schedule: projection.schedule.map((month) => ({
      month: month.month,
      year: month.year,
      debts: month.debts.map((debt) => ({
        debtId: debt.debtId,
        name: debt.name,
        startingBalance: debt.startingBalance.toFixed(2),
        interestCharged: debt.interestCharged.toFixed(2),
        paymentApplied: debt.paymentApplied.toFixed(2),
        endingBalance: debt.endingBalance.toFixed(2),
        isPaidOff: debt.isPaidOff,
      })),
    })),
  };

  // Cache the result for 5 minutes (300 seconds)
  if (cacheService.isEnabled()) {
    await cacheService.set(cacheKey, response, 300);
  }

  return c.json(response, 200);
});

/**
 * GET /orgs/:orgId/disposable-income
 * 
 * Returns the disposable income calculation breakdown.
 * 
 * This endpoint:
 * 1. Calculates total monthly income
 * 2. Calculates total monthly expenses (excluding UC-paid)
 * 3. Calculates UC taper based on income
 * 4. Returns disposable income (income - expenses - UC taper)
 * 
 * Requirements: 7.3
 * Property 38: Disposable income includes UC taper
 * Property 39: UC-paid expenses excluded from disposable income
 */
const disposableIncomeRoute = createRoute({
  method: 'get',
  path: '/:orgId/disposable-income',
  tags: ['Calculations'],
  summary: 'Get disposable income calculation',
  description: 'Returns breakdown of disposable income including UC taper calculation',
  request: {
    params: OrgIdParamSchema,
  },
  responses: {
    200: {
      description: 'Disposable income breakdown',
      content: {
        'application/json': {
          schema: DisposableIncomeResponseSchema,
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

calculationRouter.openapi(disposableIncomeRoute, async (c) => {
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

  // Try to get from cache first
  const cacheService = getCacheService();
  const cacheKey = cacheService.getDisposableIncomeKey(orgId);
  
  if (cacheService.isEnabled()) {
    const cached = await cacheService.get<any>(cacheKey);
    if (cached) {
      return c.json(cached, 200);
    }
  }

  // Calculate income, expenses, and UC taper
  const grossIncome = await incomeService.getMonthlyTotal(orgId);
  const totalExpenses = await expenseService.getMonthlyTotal(orgId, true); // Exclude UC-paid
  const ucTaper = await ucService.calculateTaperForIncome(grossIncome);
  const disposableIncome = grossIncome.minus(totalExpenses).minus(ucTaper);

  // Format response
  const response = {
    grossIncome: grossIncome.toFixed(2),
    totalExpenses: totalExpenses.toFixed(2),
    ucTaper: ucTaper.toFixed(2),
    disposableIncome: disposableIncome.toFixed(2),
  };

  // Cache the result for 5 minutes (300 seconds)
  if (cacheService.isEnabled()) {
    await cacheService.set(cacheKey, response, 300);
  }

  return c.json(response, 200);
});

export default calculationRouter;

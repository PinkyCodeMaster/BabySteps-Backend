import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, numeric, boolean, date, integer, index, pgEnum } from "drizzle-orm/pg-core";
import { organization } from "./users";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const debtTypeEnum = pgEnum("debt_type", [
  "credit-card",
  "loan",
  "overdraft",
  "ccj",
  "other",
]);

export const debtStatusEnum = pgEnum("debt_status", [
  "active",
  "paid",
]);

export const debt = pgTable(
  "debt",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: debtTypeEnum("type").notNull(),
    balance: numeric("balance", { precision: 12, scale: 2 }).notNull(),
    interestRate: numeric("interest_rate", { precision: 5, scale: 2 }).notNull(),
    minimumPayment: numeric("minimum_payment", { precision: 12, scale: 2 }).notNull(),
    isCcj: boolean("is_ccj").default(false).notNull(),
    ccjDeadline: date("ccj_deadline"),
    status: debtStatusEnum("status").default("active").notNull(),
    snowballPosition: integer("snowball_position"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("debt_organizationId_idx").on(table.organizationId),
    index("debt_status_idx").on(table.status),
    index("debt_isCcj_idx").on(table.isCcj),
  ]
);

export const debtRelations = relations(debt, ({ one }) => ({
  organization: one(organization, {
    fields: [debt.organizationId],
    references: [organization.id],
  }),
}));

// ============================================================================
// Zod Schemas for Debts
// ============================================================================

// Base schemas from Drizzle
export const insertDebtSchema = createInsertSchema(debt, {
  name: z.string().min(1, "Debt name is required"),
  balance: z.string().regex(/^\d+(\.\d{1,2})?$/, "Balance must be a valid decimal with up to 2 decimal places"),
  interestRate: z.string().regex(/^\d+(\.\d{1,2})?$/, "Interest rate must be a valid decimal with up to 2 decimal places"),
  minimumPayment: z.string().regex(/^\d+(\.\d{1,2})?$/, "Minimum payment must be a valid decimal with up to 2 decimal places"),
}).refine(
  (data) => {
    // CCJ validation: if isCcj is true, ccjDeadline must be provided
    if (data.isCcj && !data.ccjDeadline) {
      return false;
    }
    return true;
  },
  {
    message: "CCJ deadline is required when debt is marked as CCJ",
    path: ["ccjDeadline"],
  }
);

export const selectDebtSchema = createSelectSchema(debt);

// Create debt schema (excludes id, timestamps, organizationId, status, snowballPosition - set by server)
export const createDebtSchema = insertDebtSchema.omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  snowballPosition: true,
});

// Update debt schema (all fields optional, but still validate CCJ requirement)
export const updateDebtSchema = createDebtSchema.partial().refine(
  (data) => {
    // CCJ validation: if isCcj is explicitly set to true, ccjDeadline must be provided
    if (data.isCcj === true && !data.ccjDeadline) {
      return false;
    }
    return true;
  },
  {
    message: "CCJ deadline is required when debt is marked as CCJ",
    path: ["ccjDeadline"],
  }
);

// Record payment schema
export const recordPaymentSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Payment amount must be a valid decimal with up to 2 decimal places"),
});

// Response schema
export const debtResponseSchema = selectDebtSchema;

// Type exports
export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type UpdateDebtInput = z.infer<typeof updateDebtSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type DebtResponse = z.infer<typeof debtResponseSchema>;

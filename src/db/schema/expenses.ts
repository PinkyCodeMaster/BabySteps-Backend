import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, numeric, boolean, integer, index, pgEnum } from "drizzle-orm/pg-core";
import { organization } from "./users";
import { frequencyEnum } from "./incomes";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const expenseCategoryEnum = pgEnum("expense_category", [
  "housing",
  "utilities",
  "food",
  "transport",
  "insurance",
  "childcare",
  "other",
]);

export const expensePriorityEnum = pgEnum("expense_priority", [
  "essential",
  "important",
  "discretionary",
]);

export const expense = pgTable(
  "expense",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    category: expenseCategoryEnum("category").notNull(),
    priority: expensePriorityEnum("priority").notNull(),
    frequency: frequencyEnum("frequency").notNull(),
    dueDay: integer("due_day"),
    isUcPaid: boolean("is_uc_paid").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("expense_organizationId_idx").on(table.organizationId)]
);

export const expenseRelations = relations(expense, ({ one }) => ({
  organization: one(organization, {
    fields: [expense.organizationId],
    references: [organization.id],
  }),
}));

// ============================================================================
// Zod Schemas for Expenses
// ============================================================================

// Base schemas from Drizzle
export const insertExpenseSchema = createInsertSchema(expense, {
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Amount must be a valid decimal with up to 2 decimal places"),
  name: z.string().min(1, "Expense name is required"),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
});

export const selectExpenseSchema = createSelectSchema(expense);

// Create expense schema (excludes id, timestamps, organizationId - set by server)
export const createExpenseSchema = insertExpenseSchema.omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});

// Update expense schema (all fields optional)
export const updateExpenseSchema = createExpenseSchema.partial();

// Response schema
export const expenseResponseSchema = selectExpenseSchema;

// Type exports
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ExpenseResponse = z.infer<typeof expenseResponseSchema>;

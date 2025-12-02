import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, numeric, boolean, date, index, pgEnum } from "drizzle-orm/pg-core";
import { organization } from "./users";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const frequencyEnum = pgEnum("frequency", [
  "one-time",
  "weekly",
  "fortnightly",
  "monthly",
  "annual",
]);

export const income = pgTable(
  "income",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    frequency: frequencyEnum("frequency").notNull(),
    isNet: boolean("is_net").default(false).notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("income_organizationId_idx").on(table.organizationId)]
);

export const incomeRelations = relations(income, ({ one }) => ({
  organization: one(organization, {
    fields: [income.organizationId],
    references: [organization.id],
  }),
}));

// ============================================================================
// Zod Schemas for Incomes
// ============================================================================

// Base schemas from Drizzle
export const insertIncomeSchema = createInsertSchema(income, {
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Amount must be a valid decimal with up to 2 decimal places"),
  type: z.string().min(1, "Income type is required"),
  name: z.string().min(1, "Income name is required"),
});

export const selectIncomeSchema = createSelectSchema(income);

// Create income schema (excludes id, timestamps, organizationId - set by server)
export const createIncomeSchema = insertIncomeSchema.omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});

// Update income schema (all fields optional except those that shouldn't change)
export const updateIncomeSchema = createIncomeSchema.partial();

// Response schema
export const incomeResponseSchema = selectIncomeSchema;

// Type exports
export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;
export type UpdateIncomeInput = z.infer<typeof updateIncomeSchema>;
export type IncomeResponse = z.infer<typeof incomeResponseSchema>;

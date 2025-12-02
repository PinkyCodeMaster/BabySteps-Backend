import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, numeric, boolean, integer, index, pgEnum } from "drizzle-orm/pg-core";
import { organization } from "./users";
import { frequencyEnum } from "./incomes";

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

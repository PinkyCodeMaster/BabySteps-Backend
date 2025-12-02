import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, numeric, boolean, date, integer, index, pgEnum } from "drizzle-orm/pg-core";
import { organization } from "./users";

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

import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, numeric, boolean, date, index, pgEnum } from "drizzle-orm/pg-core";
import { organization } from "./users";

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

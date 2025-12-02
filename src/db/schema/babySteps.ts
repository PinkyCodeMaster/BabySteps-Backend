import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./users";

export const babyStep = pgTable(
  "baby_step",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    currentStep: integer("current_step").notNull().default(1),
    stepProgress: jsonb("step_progress").notNull().default({}),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("baby_step_organizationId_idx").on(table.organizationId)]
);

export const babyStepRelations = relations(babyStep, ({ one }) => ({
  organization: one(organization, {
    fields: [babyStep.organizationId],
    references: [organization.id],
  }),
}));

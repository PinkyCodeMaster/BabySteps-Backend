import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./users";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

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

// ============================================================================
// Zod Schemas for Baby Steps
// ============================================================================

// Step progress schema for the jsonb field
export const stepProgressSchema = z.object({
  emergencyFundSaved: z.number().optional(),
  targetMonths: z.number().int().min(3).max(6).optional(),
}).passthrough(); // Allow additional fields for future steps

// Base schemas from Drizzle
export const insertBabyStepSchema = createInsertSchema(babyStep, {
  currentStep: z.number().int().min(1).max(7),
  stepProgress: stepProgressSchema,
});

export const selectBabyStepSchema = createSelectSchema(babyStep);

// Baby Steps status schema (for GET responses)
export const babyStepsStatusSchema = selectBabyStepSchema;

// Update Baby Steps schema (for PATCH requests)
export const updateBabyStepsSchema = z.object({
  currentStep: z.number().int().min(1).max(7).optional(),
  stepProgress: stepProgressSchema.optional(),
});

// Type exports
export type StepProgress = z.infer<typeof stepProgressSchema>;
export type BabyStepsStatus = z.infer<typeof babyStepsStatusSchema>;
export type UpdateBabyStepsInput = z.infer<typeof updateBabyStepsSchema>;

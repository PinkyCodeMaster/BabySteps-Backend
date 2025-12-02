import { pgTable, text, timestamp, numeric, date } from "drizzle-orm/pg-core";

export const ucConfig = pgTable("uc_config", {
  id: text("id").primaryKey(),
  taperRate: numeric("taper_rate", { precision: 3, scale: 2 }).notNull(),
  workAllowance: numeric("work_allowance", { precision: 12, scale: 2 }).notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

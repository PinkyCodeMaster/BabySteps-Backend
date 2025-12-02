import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { organization, user } from "./users";

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    affectedRecordIds: text("affected_record_ids").array().notNull().default([]),
    metadata: jsonb("metadata").notNull().default({}),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_organizationId_idx").on(table.organizationId),
    index("audit_log_userId_idx").on(table.userId),
    index("audit_log_timestamp_idx").on(table.timestamp),
  ]
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  organization: one(organization, {
    fields: [auditLog.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [auditLog.userId],
    references: [user.id],
  }),
}));

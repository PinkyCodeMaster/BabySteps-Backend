import { db } from "./index";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

/**
 * Transaction Context Interface
 * 
 * Provides a type-safe interface for executing database operations
 * within a transaction context.
 * 
 * NOTE: The neon-http driver does not support transactions. This interface
 * is provided for future compatibility when migrating to neon-serverless driver.
 * 
 * Requirements: 5.3, 2.1, 2.3
 */
export interface TransactionContext {
  /**
   * Execute a function within a transaction
   * 
   * NOTE: Currently executes without transaction support due to neon-http driver limitations.
   * Operations are executed sequentially but not atomically.
   * 
   * @param fn - Function to execute with database client
   * @returns Promise resolving to the function's return value
   */
  execute<T>(fn: (tx: NeonHttpDatabase) => Promise<T>): Promise<T>;
}

/**
 * Transaction Wrapper
 * 
 * NOTE: The neon-http driver does not support transactions. This function currently
 * executes operations sequentially without transaction guarantees.
 * 
 * To enable full transaction support, the application needs to:
 * 1. Install 'ws' package: bun add ws
 * 2. Switch to neon-serverless driver in src/db/index.ts:
 *    - Change import from 'drizzle-orm/neon-http' to 'drizzle-orm/neon-serverless'
 *    - Use Pool instead of neon() function
 *    - Configure WebSocket: neonConfig.webSocketConstructor = ws
 * 
 * Critical operations that SHOULD use transactions (when available):
 * - Debt payment recording (update balance, create audit log, recalculate snowball)
 * - Organization creation (create org, create admin membership)
 * - Membership activation (update membership, grant access)
 * 
 * Current behavior: Operations execute sequentially without atomicity guarantees.
 * If an operation fails, previous operations are NOT rolled back.
 * 
 * Usage:
 * ```typescript
 * const result = await withTransaction(async (tx) => {
 *   // Perform multiple operations
 *   const debt = await tx.update(debtTable).set({ balance: newBalance });
 *   await tx.insert(auditLog).values({ ... });
 *   return debt;
 * });
 * ```
 * 
 * Requirements: 5.3, 2.1, 2.3
 */
export async function withTransaction<T>(
  fn: (tx: NeonHttpDatabase) => Promise<T>
): Promise<T> {
  // neon-http driver does not support transactions
  // Execute function with regular db client instead
  // This provides the same interface but without transaction guarantees
  return await fn(db as NeonHttpDatabase);
}

/**
 * Create a transaction context
 * 
 * Alternative API that provides an object-oriented interface for transactions.
 * 
 * NOTE: Currently does not provide transaction guarantees due to driver limitations.
 * 
 * @returns TransactionContext instance
 */
export function createTransactionContext(): TransactionContext {
  return {
    execute: withTransaction,
  };
}

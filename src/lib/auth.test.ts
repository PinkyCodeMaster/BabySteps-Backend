import { describe, test, expect } from "bun:test";
import { auth } from "./auth";

/**
 * Basic tests for Better Auth configuration
 * 
 * These tests verify that the auth instance is properly configured.
 */
describe("Better Auth Configuration", () => {
  test("auth instance should be defined", () => {
    expect(auth).toBeDefined();
  });

  test("auth should have handler method", () => {
    expect(auth.handler).toBeDefined();
    expect(typeof auth.handler).toBe("function");
  });

  test("auth should have api methods", () => {
    expect(auth.api).toBeDefined();
    expect(auth.api.getSession).toBeDefined();
  });

  test("auth should be properly configured", () => {
    // Verify that auth has the expected structure
    expect(auth).toHaveProperty("handler");
    expect(auth).toHaveProperty("api");
  });
});

import { describe, it, expect } from 'bun:test';

describe('Environment Configuration Validation', () => {

  it('should validate valid environment configuration', () => {
    // This test validates that the current environment is properly configured
    // Since we're running in a test environment, we expect valid config
    const { validateEnv, getConfig } = require('../../config');

    // Should not throw with current environment
    const config = validateEnv();

    // Verify config has required fields
    expect(config.DATABASE_URL).toBeDefined();
    expect(config.BETTER_AUTH_SECRET).toBeDefined();
    expect(config.BETTER_AUTH_URL).toBeDefined();
    expect(config.ALLOWED_ORIGINS).toBeDefined();
    expect(config.PORT).toBeGreaterThan(0);
    expect(config.NODE_ENV).toMatch(/^(development|production|test)$/);
    expect(config.LOG_LEVEL).toMatch(/^(debug|info|warn|error)$/);

    // getConfig should return the same config
    expect(getConfig()).toEqual(config);
  });

  it('should provide helper functions for environment checks', () => {
    const { getConfig, isProduction, isDevelopment, isTest } = require('../../config');
    
    // Get the validated config
    const config = getConfig();

    // Test helper functions based on actual environment
    if (config.NODE_ENV === 'production') {
      expect(isProduction()).toBe(true);
      expect(isDevelopment()).toBe(false);
      expect(isTest()).toBe(false);
    } else if (config.NODE_ENV === 'development') {
      expect(isProduction()).toBe(false);
      expect(isDevelopment()).toBe(true);
      expect(isTest()).toBe(false);
    } else if (config.NODE_ENV === 'test') {
      expect(isProduction()).toBe(false);
      expect(isDevelopment()).toBe(false);
      expect(isTest()).toBe(true);
    }
  });

  it('should validate BETTER_AUTH_SECRET is at least 32 characters', () => {
    const { getConfig } = require('../../config');
    const config = getConfig();

    // Verify the secret meets minimum length requirement
    expect(config.BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it('should validate DATABASE_URL is a valid URL', () => {
    const { getConfig } = require('../../config');
    const config = getConfig();

    // Verify DATABASE_URL is a valid URL format
    expect(() => new URL(config.DATABASE_URL)).not.toThrow();
  });

  it('should validate BETTER_AUTH_URL is a valid URL', () => {
    const { getConfig } = require('../../config');
    const config = getConfig();

    // Verify BETTER_AUTH_URL is a valid URL format
    expect(() => new URL(config.BETTER_AUTH_URL)).not.toThrow();
  });

  it('should validate ALLOWED_ORIGINS is not empty', () => {
    const { getConfig } = require('../../config');
    const config = getConfig();

    // Verify ALLOWED_ORIGINS has content
    expect(config.ALLOWED_ORIGINS.length).toBeGreaterThan(0);
  });

  it('should validate PORT is a positive number', () => {
    const { getConfig } = require('../../config');
    const config = getConfig();

    // Verify PORT is a valid port number
    expect(config.PORT).toBeGreaterThan(0);
    expect(config.PORT).toBeLessThanOrEqual(65535);
  });

  it('should validate NODE_ENV is one of allowed values', () => {
    const { getConfig } = require('../../config');
    const config = getConfig();

    // Verify NODE_ENV is one of the allowed values
    expect(['development', 'production', 'test']).toContain(config.NODE_ENV);
  });

  it('should validate LOG_LEVEL is one of allowed values', () => {
    const { getConfig } = require('../../config');
    const config = getConfig();

    // Verify LOG_LEVEL is one of the allowed values
    expect(['debug', 'info', 'warn', 'error']).toContain(config.LOG_LEVEL);
  });
});

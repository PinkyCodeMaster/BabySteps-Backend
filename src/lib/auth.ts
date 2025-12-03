import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, openAPI } from "better-auth/plugins";
import * as schema from "../db/schema";
import { db } from "../db";
import { logger } from './logger';

// Get environment variables
// Note: These will be validated by config module on server startup
const authSecret = process.env["BETTER_AUTH_SECRET"]!;
const authUrl = process.env["BETTER_AUTH_URL"] || "http://localhost:9000";

/**
 * Better Auth configuration with organization plugin
 * 
 * Features:
 * - Email/password authentication
 * - Session management with secure cookies
 * - Organization support (one-family model)
 * - Postgres adapter via Drizzle ORM
 */
export const auth = betterAuth({
  // Database configuration using Drizzle adapter
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
    },
  }),

  // Email/password authentication
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Can be enabled later
  },

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache for 5 minutes
    },
  },

  // Security settings
  secret: authSecret,
  baseURL: authUrl,
  basePath: "/api/v1/auth",

  // Advanced session options
  advanced: {
    cookiePrefix: "debt_snowball",
    crossSubDomainCookies: {
      enabled: false,
    },
    useSecureCookies: process.env["NODE_ENV"] === "production",
  },

  // Organization plugin for multi-tenant support
  plugins: [
    organization({
      // Allow users to create organizations
      allowUserToCreateOrganization: true,

      // Creator becomes admin automatically
      creatorRole: "admin",

      // Send invitation emails (can be configured later)
      sendInvitationEmail: async (data) => {
        // TODO: Implement email sending in future task
        logger.info({ email: data.email }, "Invitation email would be sent");
        return Promise.resolve();
      },
    }),
    openAPI()
  ],
})

/**
 * Type exports for Better Auth
 */
export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;

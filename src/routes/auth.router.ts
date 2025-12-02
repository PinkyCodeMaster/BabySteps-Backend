import { Hono } from "hono";
import { auth } from "../lib/auth";

/**
 * Authentication router
 * 
 * Exposes Better Auth endpoints for:
 * - User registration
 * - User login
 * - User logout
 * - Session management
 * - Organization management
 * 
 */
const authRouter = new Hono();

/**
 * Mount Better Auth handlers
 * 
 * Better Auth provides built-in handlers for all auth operations.
 * We mount them at the /auth path.
 * 
 * Available endpoints:
 * - POST /sign-up/email - Register with email/password
 * - POST /sign-in/email - Login with email/password
 * - POST /sign-out - Logout
 * - GET /get-session - Get current session
 * - POST /organization/create - Create organization
 * - POST /organization/invite-member - Invite user to organization
 * - GET /organization/list-organizations - List user's organizations
 * - POST /organization/set-active - Set active organization
 */
authRouter.all("/*", async (c) => {
  // Pass the request to Better Auth handler
  return auth.handler(c.req.raw);
});

export default authRouter;

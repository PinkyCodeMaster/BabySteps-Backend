import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { deletionService } from "../services";
import { authMiddleware, getAuthContext } from "../middleware/auth.middleware";
import { AppError, ErrorCodes } from "../middleware/errorHandler.middleware";

/**
 * User router
 * 
 * Provides REST endpoints for user management operations.
 * 
 * Endpoints:
 * - POST /users/:userId/delete - Request account deletion
 * 
 */
const userRouter = new OpenAPIHono();

// All user routes require authentication
userRouter.use("/*", authMiddleware);

// Common schemas
const UserIdParamSchema = z.object({
  userId: z.string().openapi({ 
    example: 'user_123',
    description: 'User ID to delete'
  }),
});

const DeletionResponseSchema = z.object({
  userId: z.string(),
  deletedAt: z.string(),
  scheduledHardDeleteAt: z.string(),
  message: z.string(),
});

const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

/**
 * POST /users/:userId/delete
 * 
 * Request account deletion
 * 
 * Soft deletes a user account by marking it as deleted and anonymizing
 * the email. The account is scheduled for permanent deletion after 30 days.
 * 
 * Authorization:
 * - Users can delete their own account
 * - Admins can delete accounts in their organization (future enhancement)
 * 
 * Requirements: 10.1
 */
const deleteUserRoute = createRoute({
  method: 'post',
  path: '/:userId/delete',
  tags: ['Users'],
  summary: 'Request account deletion',
  description: 'Soft deletes a user account and schedules permanent deletion after 30 days. Users can delete their own account. The email is anonymized to prevent login.',
  request: {
    params: UserIdParamSchema,
  },
  responses: {
    200: {
      description: 'Account deletion confirmed',
      content: {
        'application/json': {
          schema: DeletionResponseSchema,
        },
      },
    },
    403: {
      description: 'Access denied - insufficient permissions',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    409: {
      description: 'User already deleted',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

userRouter.openapi(deleteUserRoute, async (c) => {
  const { userId: requesterId } = getAuthContext(c);
  const userId = c.req.param("userId");

  // Check if requester has permission to delete this user
  const canDelete = await deletionService.canDeleteUser(userId, requesterId);

  if (!canDelete) {
    throw new AppError(
      ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS,
      "You do not have permission to delete this user account",
      403
    );
  }

  // Perform soft delete
  const result = await deletionService.softDeleteUser(userId, requesterId);

  return c.json(result, 200);
});

export default userRouter;

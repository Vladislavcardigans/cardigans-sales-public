export {
  authenticateUser,
  recordLogin,
} from "./server/auth.queries";

export {
  createSession,
  deleteCurrentSession,
  getCurrentSession,
} from "./server/session";

export {
  SESSION_COOKIE_NAME,
} from "./server/session.constants";

export type {
  AuthenticatedUser,
  AuthSession,
} from "./types/auth";

export {
  hasPermission,
  hasRole,
  listUserPermissions,
  permissionCodes,
  requirePermission,
} from "./server/permissions";

export type {
  PermissionCode,
} from "./server/permissions";

export type AuthenticatedUser = {
  id: string;
  tenantId: string;
  tenantName: string;

  email: string;
  displayName: string;

  roles: string[];
};

export type AuthSession = {
  id: string;
  expiresAt: Date;

  user: AuthenticatedUser;
};

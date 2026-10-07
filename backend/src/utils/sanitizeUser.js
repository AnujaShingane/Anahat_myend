export function sanitizeUser(user) {
  const u = user.toJSON ? user.toJSON() : { ...user };
  delete u.passwordHash;
  return u;
}

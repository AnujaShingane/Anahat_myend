import bcrypt from 'bcryptjs';
export const hashPassword = (p) => bcrypt.hash(p, 12);
export const comparePassword = (p, hash) => (hash ? bcrypt.compare(p, hash) : false);

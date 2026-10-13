import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import { env } from './env.js';

const PgStore = connectPgSimple(session);
const pool = new pg.Pool({ connectionString: env.pgUri });

// Sessions live in Postgres so a server restart does not log everyone out.
export const sessionMiddleware = session({
  store: new PgStore({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  name: 'harmony.sid',
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,                     // active users stay signed in; idle sessions expire
  cookie: {
    httpOnly: true,                  // page JS cannot read the cookie
    sameSite: 'strict',              // never sent on cross-site requests (CSRF)
    secure: env.nodeEnv === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
});

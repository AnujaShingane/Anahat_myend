import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { sessionMiddleware } from './config/session.js';
import passport from './config/passport.js';
import api from './routes/index.js';
import { requireAppOrigin } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.clientUrls, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(sessionMiddleware);
app.use(passport.initialize());

app.use('/api', apiLimiter, requireAppOrigin(env.clientUrls), api);

app.use(notFound);
app.use(errorHandler);

export default app;

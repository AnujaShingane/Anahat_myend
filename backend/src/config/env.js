import dotenv from 'dotenv';
dotenv.config();

const required = ['PG_URI', 'MONGO_URI', 'SESSION_SECRET'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing env variable: ${key}`);
}

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const configuredClientUrls = (process.env.CLIENT_URLS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const clientUrls = Array.from(new Set([
  clientUrl,
  ...configuredClientUrls,
  clientUrl.replace('localhost', '127.0.0.1'),
  clientUrl.replace('127.0.0.1', 'localhost'),
]));

export const env = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl,
  clientUrls,
  sessionSecret: process.env.SESSION_SECRET,
  pgUri: process.env.PG_URI,
  mongoUri: process.env.MONGO_URI,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL,
  },
  admin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    name: process.env.ADMIN_NAME || 'Admin',
  },
  relaxationFee: Number(process.env.RELAXATION_FEE || 199), // INR — flat fee to unlock one day of Relaxation sessions
  premiumFee: Number(process.env.PREMIUM_FEE || 999), // INR — flat fee to upgrade Basic -> Premium
  freeAiConsultations: Number(process.env.FREE_AI_CONSULTATIONS || 5),
};

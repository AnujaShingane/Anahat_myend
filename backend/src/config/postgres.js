import { Sequelize } from 'sequelize';
import { env } from './env.js';

export const sequelize = new Sequelize(env.pgUri, { dialect: 'postgres', logging: false });

export async function connectPostgres() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: env.nodeEnv === 'development' });
  console.log('✔ PostgreSQL connected');
}

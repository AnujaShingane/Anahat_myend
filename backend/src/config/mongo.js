import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectMongo() {
  await mongoose.connect(env.mongoUri);
  console.log('✔ MongoDB connected');
}

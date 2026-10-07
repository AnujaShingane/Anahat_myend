import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/postgres.js';

export const Payment = sequelize.define('Payment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appointmentId: { type: DataTypes.UUID, allowNull: false },
  patientId: { type: DataTypes.UUID, allowNull: false },
  therapistId: { type: DataTypes.UUID, allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  currency: { type: DataTypes.STRING, defaultValue: 'INR' },
  provider: { type: DataTypes.STRING, defaultValue: 'mock' }, // swap for razorpay/stripe
  providerRef: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.ENUM('created', 'paid', 'failed', 'refunded'), defaultValue: 'created' },
}, { tableName: 'payments', timestamps: true });

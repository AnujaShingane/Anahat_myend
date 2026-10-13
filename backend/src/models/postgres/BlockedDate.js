import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/postgres.js';

export const BlockedDate = sequelize.define('BlockedDate', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  therapistId: { type: DataTypes.UUID, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  reason: { type: DataTypes.STRING, allowNull: true },
}, { tableName: 'blocked_dates', timestamps: false });

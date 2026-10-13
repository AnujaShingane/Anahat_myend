import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/postgres.js';

// Weekly recurring slot, e.g. Monday 10:00-11:00
export const AvailabilitySlot = sequelize.define('AvailabilitySlot', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  therapistId: { type: DataTypes.UUID, allowNull: false },
  dayOfWeek: { type: DataTypes.INTEGER, allowNull: false }, // 0 Sun .. 6 Sat
  startTime: { type: DataTypes.STRING, allowNull: false },  // "10:00"
  endTime: { type: DataTypes.STRING, allowNull: false },
}, { tableName: 'availability_slots', timestamps: false });

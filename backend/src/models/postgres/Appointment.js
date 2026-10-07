import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/postgres.js';

export const Appointment = sequelize.define('Appointment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  patientId: { type: DataTypes.UUID, allowNull: false },
  therapistId: { type: DataTypes.UUID, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  startTime: { type: DataTypes.STRING, allowNull: false },
  endTime: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.ENUM('pending_payment', 'confirmed', 'completed', 'cancelled'), defaultValue: 'pending_payment' },
  // online = Google Meet link (entered by the therapist); offline = in person
  mode: { type: DataTypes.ENUM('online', 'offline'), defaultValue: 'online' },
  meetLink: { type: DataTypes.STRING, allowNull: true },
}, { tableName: 'appointments', timestamps: true });

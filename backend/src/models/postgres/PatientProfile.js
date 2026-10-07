import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/postgres.js';

export const PatientProfile = sequelize.define('PatientProfile', {
  userId: { type: DataTypes.UUID, primaryKey: true },
  age: { type: DataTypes.INTEGER, allowNull: false },
  gender: { type: DataTypes.STRING, allowNull: false },
  occupation: { type: DataTypes.STRING, allowNull: false },
  maritalStatus: { type: DataTypes.STRING, allowNull: false },
  disease: { type: DataTypes.STRING, allowNull: false },
  problems: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] }, // chosen from dropdown
  problemDescription: { type: DataTypes.TEXT, allowNull: false },
  caregiverName: { type: DataTypes.STRING, allowNull: true },
  caregiverRelation: { type: DataTypes.STRING, allowNull: true },
  healthReportFileId: { type: DataTypes.STRING, allowNull: true }, // Mongo file id (optional)
}, { tableName: 'patient_profiles', timestamps: true });

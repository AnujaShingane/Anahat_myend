import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/postgres.js';

export const TherapistProfile = sequelize.define('TherapistProfile', {
  userId: { type: DataTypes.UUID, primaryKey: true },
  age: { type: DataTypes.INTEGER, allowNull: false },
  gender: { type: DataTypes.STRING, allowNull: false },
  experienceYears: { type: DataTypes.INTEGER, allowNull: false },
  experienceDetails: { type: DataTypes.TEXT, allowNull: false },
  profession: { type: DataTypes.STRING, allowNull: false }, // Music therapist / Psychiatrist / ...
  fee: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  address: { type: DataTypes.TEXT, allowNull: false },
  bio: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'therapist_profiles', timestamps: true });

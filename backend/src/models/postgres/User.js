import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/postgres.js';

// The user id (UUID) generated here is the SAME id used in every Mongo document.
export const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  firstName: { type: DataTypes.STRING, allowNull: false },
  lastName: { type: DataTypes.STRING, allowNull: false, defaultValue: '' },
  phone: { type: DataTypes.STRING, allowNull: true },             // contact number — all roles
  email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
  passwordHash: { type: DataTypes.STRING, allowNull: true },
  googleId: { type: DataTypes.STRING, allowNull: true },
  role: { type: DataTypes.ENUM('patient', 'therapist', 'admin'), allowNull: false },
  accountType: { type: DataTypes.ENUM('self', 'caregiver'), allowNull: true }, // patients only
  isApproved: { type: DataTypes.BOOLEAN, defaultValue: true },   // therapists start false
  isProfileComplete: { type: DataTypes.BOOLEAN, defaultValue: false },
  isSuspended: { type: DataTypes.BOOLEAN, defaultValue: false }, // technical admin account control
  avatarFileId: { type: DataTypes.STRING, allowNull: true },     // Mongo file id
}, { tableName: 'users', timestamps: true });

import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/postgres.js';

// Used to enforce "only two tracks per day" per patient.
export const TrackPlay = sequelize.define('TrackPlay', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  patientId: { type: DataTypes.UUID, allowNull: false },
  trackId: { type: DataTypes.STRING, allowNull: false }, // Mongo track id
  playedOn: { type: DataTypes.DATEONLY, allowNull: false },
}, { tableName: 'track_plays', timestamps: true });

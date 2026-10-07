import { User } from './User.js';
import { PatientProfile } from './PatientProfile.js';
import { TherapistProfile } from './TherapistProfile.js';
import { AvailabilitySlot } from './AvailabilitySlot.js';
import { BlockedDate } from './BlockedDate.js';
import { Appointment } from './Appointment.js';
import { Payment } from './Payment.js';
import { TrackPlay } from './TrackPlay.js';

User.hasOne(PatientProfile, { foreignKey: 'userId', as: 'patientProfile', onDelete: 'CASCADE' });
PatientProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasOne(TherapistProfile, { foreignKey: 'userId', as: 'therapistProfile', onDelete: 'CASCADE' });
TherapistProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(AvailabilitySlot, { foreignKey: 'therapistId', as: 'slots', onDelete: 'CASCADE' });
User.hasMany(BlockedDate, { foreignKey: 'therapistId', as: 'blockedDates', onDelete: 'CASCADE' });

Appointment.belongsTo(User, { foreignKey: 'patientId', as: 'patient' });
Appointment.belongsTo(User, { foreignKey: 'therapistId', as: 'therapist' });
Payment.belongsTo(Appointment, { foreignKey: 'appointmentId', as: 'appointment' });
Payment.belongsTo(User, { foreignKey: 'patientId', as: 'patient' });
Payment.belongsTo(User, { foreignKey: 'therapistId', as: 'therapist' });

export { User, PatientProfile, TherapistProfile, AvailabilitySlot, BlockedDate, Appointment, Payment, TrackPlay };

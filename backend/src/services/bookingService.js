import { AvailabilitySlot, BlockedDate, Appointment } from '../models/postgres/index.js';
import { Op } from 'sequelize';

// Returns the free slots of a therapist for a specific date.
export async function freeSlotsOn(therapistId, dateStr) {
  const blocked = await BlockedDate.findOne({ where: { therapistId, date: dateStr } });
  if (blocked) return [];
  const dayOfWeek = new Date(dateStr).getDay();
  const slots = await AvailabilitySlot.findAll({ where: { therapistId, dayOfWeek } });
  const taken = await Appointment.findAll({
    where: { therapistId, date: dateStr, status: { [Op.in]: ['pending_payment', 'confirmed'] } },
  });
  const takenTimes = new Set(taken.map((a) => a.startTime));
  return slots.filter((s) => !takenTimes.has(s.startTime));
}

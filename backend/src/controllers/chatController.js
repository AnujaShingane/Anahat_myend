import { Message } from '../models/mongo/Message.js';
import { Appointment, User } from '../models/postgres/index.js';
import { roomIdFor } from '../utils/chatRoom.js';

// Only people with a confirmed appointment together can chat.
export async function canChat(patientId, therapistId) {
  const a = await Appointment.findOne({ where: { patientId, therapistId, status: ['confirmed', 'completed'] } });
  return !!a;
}

export async function contacts(req, res) {
  const isPatient = req.user.role === 'patient';
  const where = isPatient ? { patientId: req.user.id } : { therapistId: req.user.id };
  const appts = await Appointment.findAll({
    where: { ...where, status: ['confirmed', 'completed'] },
    include: [{ model: User, as: isPatient ? 'therapist' : 'patient', attributes: ['id', 'firstName', 'lastName', 'avatarFileId'] }],
  });
  const seen = new Map();
  for (const a of appts) { const u = isPatient ? a.therapist : a.patient; seen.set(u.id, u); }
  res.json({ contacts: [...seen.values()] });
}

export async function history(req, res) {
  const other = req.params.userId;
  const [patientId, therapistId] = req.user.role === 'patient' ? [req.user.id, other] : [other, req.user.id];
  if (!(await canChat(patientId, therapistId))) return res.status(403).json({ message: 'No active booking between you.' });
  const messages = await Message.find({ roomId: roomIdFor(patientId, therapistId) }).sort({ createdAt: 1 }).limit(500);
  res.json({ messages, roomId: roomIdFor(patientId, therapistId) });
}

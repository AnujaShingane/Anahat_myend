import { Appointment, Payment, User, TherapistProfile } from '../models/postgres/index.js';
import { freeSlotsOn } from '../services/bookingService.js';
import { createOrder, verifyPayment } from '../services/paymentService.js';
import { PatientNotification } from '../models/mongo/patientData.js';

export async function book(req, res) {
  const { therapistId, date, startTime } = req.body;
  const mode = req.body.mode === 'offline' ? 'offline' : 'online';
  const meetLink = mode === 'online' ? String(req.body.meetLink || '').trim() : null;
  if (mode === 'online' && !meetLink) {
    return res.status(400).json({ message: 'A meeting link (Google Meet, Zoom, etc.) is required for online sessions.' });
  }
  const free = await freeSlotsOn(therapistId, date);
  const slot = free.find((s) => s.startTime === startTime);
  if (!slot) return res.status(409).json({ message: 'That slot is no longer available.' });

  const profile = await TherapistProfile.findByPk(therapistId);
  const appt = await Appointment.create({ patientId: req.user.id, therapistId, date, startTime, endTime: slot.endTime, mode, meetLink });
  const order = await createOrder(profile.fee);
  const payment = await Payment.create({
    appointmentId: appt.id, patientId: req.user.id, therapistId, amount: profile.fee, providerRef: order.orderId,
  });
  res.status(201).json({ appointment: appt, payment });
}

// "Pay now" – confirms the mock payment
export async function pay(req, res) {
  const payment = await Payment.findOne({ where: { id: req.params.paymentId, patientId: req.user.id } });
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  const ok = await verifyPayment(payment.providerRef, req.body.paymentRef);
  if (!ok) return res.status(400).json({ message: 'Payment verification failed' });
  await payment.update({ status: 'paid' });
  await Appointment.update({ status: 'confirmed' }, { where: { id: payment.appointmentId } });
  const appt = await Appointment.findByPk(payment.appointmentId);
  const t = appt ? await User.findByPk(appt.therapistId, { attributes: ['firstName', 'lastName'] }) : null;
  await PatientNotification.create({
    patientId: payment.patientId,
    message: `Your session with ${t ? `${t.firstName} ${t.lastName}`.trim() : 'your therapist'} on ${appt?.date} at ${appt?.startTime} is confirmed. You showed up for yourself today — that matters.`,
    detail: { appointmentId: payment.appointmentId, kind: 'booking' },
  });
  res.json({ message: 'Payment successful', payment });
}

export async function myAppointments(req, res) {
  const where = req.user.role === 'patient' ? { patientId: req.user.id } : { therapistId: req.user.id };
  const appts = await Appointment.findAll({
    where,
    include: [
      { model: User, as: 'therapist', attributes: ['id', 'firstName', 'lastName', 'avatarFileId'] },
      { model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName', 'avatarFileId'] },
    ],
    order: [['date', 'DESC']],
  });
  res.json({ appointments: appts });
}

export async function myPayments(req, res) {
  const payments = await Payment.findAll({ where: { patientId: req.user.id }, order: [['createdAt', 'DESC']] });
  res.json({ payments });
}

// Cancel / reschedule / mark-complete — the only appointment mutation besides
// booking + paying. Restricted to the appointment's own patient or
// therapist. Rescheduling re-checks the new slot is actually free.
export async function updateStatus(req, res) {
  const appt = await Appointment.findByPk(req.params.id);
  if (!appt) return res.status(404).json({ message: 'Appointment not found' });
  if (appt.patientId !== req.user.id && appt.therapistId !== req.user.id) {
    return res.status(403).json({ message: 'You do not have access to this appointment.' });
  }

  const { status, date, startTime } = req.body;
  if (date && startTime) {
    const free = await freeSlotsOn(appt.therapistId, date);
    const slot = free.find((s) => s.startTime === startTime);
    if (!slot) return res.status(409).json({ message: 'That slot is no longer available.' });
    await appt.update({ date, startTime, endTime: slot.endTime, status: status || appt.status });
  } else if (status) {
    if (!['confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }
    await appt.update({ status });
    const copy = {
      completed: 'Session complete. Every session is a step forward — well done.',
      cancelled: 'Your session was cancelled. Whenever you are ready, a new slot is a click away.',
      confirmed: 'Your session is confirmed.',
    }[status];
    if (copy) await PatientNotification.create({ patientId: appt.patientId, message: copy, detail: { appointmentId: appt.id, kind: status } });
  }
  res.json({ appointment: appt });
}

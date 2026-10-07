import { User, TherapistProfile, AvailabilitySlot, BlockedDate, Appointment, Payment, PatientProfile } from '../models/postgres/index.js';
import { freeSlotsOn } from '../services/bookingService.js';

const publicAttrs = ['id', 'firstName', 'lastName', 'avatarFileId'];

// Patients browse approved therapists (cards)
export async function listTherapists(_req, res) {
  const therapists = await User.findAll({
    where: { role: 'therapist', isApproved: true, isProfileComplete: true },
    attributes: publicAttrs,
    include: [{ model: TherapistProfile, as: 'therapistProfile' }],
  });
  res.json({ therapists });
}

// Detailed therapist page
export async function getTherapist(req, res) {
  const t = await User.findOne({
    where: { id: req.params.id, role: 'therapist', isApproved: true },
    attributes: publicAttrs,
    include: [
      { model: TherapistProfile, as: 'therapistProfile' },
      { model: AvailabilitySlot, as: 'slots' },
      { model: BlockedDate, as: 'blockedDates' },
    ],
  });
  if (!t) return res.status(404).json({ message: 'Therapist not found' });
  res.json({ therapist: t });
}

export async function getFreeSlots(req, res) {
  const slots = await freeSlotsOn(req.params.id, req.query.date);
  res.json({ slots });
}

// ----- therapist's own dashboard -----
export async function setSlots(req, res) {
  const { slots } = req.body; // [{dayOfWeek,startTime,endTime}]
  await AvailabilitySlot.destroy({ where: { therapistId: req.user.id } });
  const created = await AvailabilitySlot.bulkCreate(slots.map((s) => ({ ...s, therapistId: req.user.id })));
  res.json({ slots: created });
}

export async function mySlots(req, res) {
  res.json({ slots: await AvailabilitySlot.findAll({ where: { therapistId: req.user.id } }) });
}

export async function blockDate(req, res) {
  const bd = await BlockedDate.create({ therapistId: req.user.id, date: req.body.date, reason: req.body.reason });
  res.status(201).json({ blockedDate: bd });
}

export async function unblockDate(req, res) {
  await BlockedDate.destroy({ where: { id: req.params.id, therapistId: req.user.id } });
  res.json({ message: 'Date unblocked' });
}

export async function myBlockedDates(req, res) {
  res.json({ blockedDates: await BlockedDate.findAll({ where: { therapistId: req.user.id } }) });
}

// Patients who booked this therapist, with full profiles
export async function myPatients(req, res) {
  const appts = await Appointment.findAll({
    where: { therapistId: req.user.id },
    include: [{ model: User, as: 'patient', attributes: { exclude: ['passwordHash'] }, include: [{ model: PatientProfile, as: 'patientProfile' }] }],
    order: [['date', 'DESC']],
  });
  res.json({ appointments: appts });
}

export async function myPaymentHistory(req, res) {
  const payments = await Payment.findAll({
    where: { therapistId: req.user.id },
    include: [{ model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName'] }],
    order: [['createdAt', 'DESC']],
  });
  res.json({ payments });
}

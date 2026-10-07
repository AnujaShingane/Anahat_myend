import { User, PatientProfile, TherapistProfile, Appointment, Payment } from '../models/postgres/index.js';
import mongoose from 'mongoose';
import { sequelize } from '../config/postgres.js';
import { env } from '../config/env.js';

const startedAt = Date.now();

export async function overview(_req, res) {
  const [patients, therapists, pendingTherapists, appointments, payments] = await Promise.all([
    User.count({ where: { role: 'patient' } }),
    User.count({ where: { role: 'therapist', isApproved: true } }),
    User.count({ where: { role: 'therapist', isApproved: false } }),
    Appointment.count(),
    Payment.sum('amount', { where: { status: 'paid' } }),
  ]);
  res.json({ stats: { patients, therapists, pendingTherapists, appointments, revenue: payments || 0 } });
}

export async function listUsers(req, res) {
  const role = req.query.role;
  const users = await User.findAll({
    where: role ? { role } : {},
    attributes: { exclude: ['passwordHash'] },
    include: [{ model: PatientProfile, as: 'patientProfile' }, { model: TherapistProfile, as: 'therapistProfile' }],
    order: [['createdAt', 'DESC']],
  });
  res.json({ users });
}

export async function approveTherapist(req, res) {
  const t = await User.findOne({ where: { id: req.params.id, role: 'therapist' } });
  if (!t) return res.status(404).json({ message: 'Therapist not found' });
  await t.update({ isApproved: req.body.approved !== false });
  res.json({ message: t.isApproved ? 'Therapist approved' : 'Therapist rejected' });
}

// Technical Admin account control — a real, enforced suspension (checked in
// login and on every authenticated request via requireAuth), not just a
// cosmetic status flag.
export async function suspendUser(req, res) {
  if (req.params.id === req.user.id) return res.status(400).json({ message: 'You cannot suspend your own account.' });
  const u = await User.findByPk(req.params.id);
  if (!u) return res.status(404).json({ message: 'User not found' });
  await u.update({ isSuspended: req.body.suspended !== false });
  res.json({ message: u.isSuspended ? 'Account suspended' : 'Account reactivated' });
}

export async function deleteUser(req, res) {
  if (req.params.id === req.user.id) return res.status(400).json({ message: 'You cannot delete yourself' });
  await User.destroy({ where: { id: req.params.id } });
  res.json({ message: 'User removed' });
}

export async function listPayments(_req, res) {
  const payments = await Payment.findAll({
    include: [
      { model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName'] },
      { model: User, as: 'therapist', attributes: ['id', 'firstName', 'lastName'] },
    ],
    order: [['createdAt', 'DESC']],
  });
  res.json({ payments });
}

export async function listAppointments(_req, res) {
  const appointments = await Appointment.findAll({
    include: [
      { model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName'] },
      { model: User, as: 'therapist', attributes: ['id', 'firstName', 'lastName'] },
    ],
    order: [['date', 'DESC']],
  });
  res.json({ appointments });
}

// Real backend/system status for Technical Admin — live-checked on every
// call, not cached or hardcoded.
export async function systemInfo(_req, res) {
  let postgresConnected = false;
  try { await sequelize.authenticate(); postgresConnected = true; } catch { /* stays false */ }
  const mongoConnected = mongoose.connection.readyState === 1;

  const [patients, therapists, admins, caregivers, appointments, payments] = await Promise.all([
    User.count({ where: { role: 'patient' } }),
    User.count({ where: { role: 'therapist' } }),
    User.count({ where: { role: 'admin' } }),
    User.count({ where: { role: 'patient', accountType: 'caregiver' } }),
    Appointment.count(),
    Payment.count(),
  ]);

  res.json({
    nodeEnv: env.nodeEnv,
    port: env.port,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    serverTime: new Date().toISOString(),
    postgresConnected,
    mongoConnected,
    googleOAuthConfigured: Boolean(env.google.clientId && env.google.clientSecret),
    counts: { patients, therapists, admins, caregivers, appointments, payments },
  });
}

import { Router } from 'express';
import authRoutes from './authRoutes.js';
import profileRoutes from './profileRoutes.js';
import therapistRoutes from './therapistRoutes.js';
import appointmentRoutes from './appointmentRoutes.js';
import trackRoutes from './trackRoutes.js';
import prescriptionRoutes from './prescriptionRoutes.js';
import chatRoutes from './chatRoutes.js';
import adminRoutes from './adminRoutes.js';
import patientDataRoutes from './patientDataRoutes.js';
import anahatRoutes from '../anahat/anahatRoutes.js';

const api = Router();
api.use('/auth', authRoutes);
api.use('/profile', profileRoutes);
api.use('/therapists', therapistRoutes);
api.use('/appointments', appointmentRoutes);
api.use('/tracks', trackRoutes);
api.use('/prescriptions', prescriptionRoutes);
api.use('/chat', chatRoutes);
api.use('/admin', adminRoutes);
// ANAHAT AI Engine gateway — additive module, see src/anahat/.
api.use('/anahat', anahatRoutes);
api.get('/health', (_req, res) => res.json({ ok: true }));

// Extended data endpoints backing the frontend-2 dashboard (patients,
// sessions, conversations, bookings, admin extras, etc). Mounted last and at
// the root so it only ever handles paths none of the routers above already
// claim — nothing above is modified or overridden, including the existing
// Postgres-backed /appointments flow frontend-1 depends on.
api.use('/', patientDataRoutes);

export default api;

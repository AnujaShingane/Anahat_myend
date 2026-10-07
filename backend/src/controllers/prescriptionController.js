import { Prescription } from '../models/mongo/Prescription.js';
import { saveFile } from '../services/fileService.js';

export async function createPrescription(req, res) {
  const { patientId, appointmentId, title, notes, recommendedTrackIds } = req.body;
  const fileId = req.file ? await saveFile(patientId, 'prescription', req.file) : undefined;
  const p = await Prescription.create({
    patientId, therapistId: req.user.id, appointmentId, title, notes,
    recommendedTrackIds: recommendedTrackIds ? JSON.parse(recommendedTrackIds) : [],
    fileId,
  });
  res.status(201).json({ prescription: p });
}

export async function myPrescriptions(req, res) {
  const filter = req.user.role === 'patient' ? { patientId: req.user.id } : { therapistId: req.user.id };
  if (req.query.patientId && req.user.role !== 'patient') filter.patientId = req.query.patientId;
  const prescriptions = await Prescription.find(filter).sort({ createdAt: -1 });
  res.json({ prescriptions });
}

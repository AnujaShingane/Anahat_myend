import mongoose from 'mongoose';

const prescriptionSchema = new mongoose.Schema({
  patientId: { type: String, required: true, index: true },
  therapistId: { type: String, required: true, index: true },
  appointmentId: String,
  title: { type: String, required: true },
  notes: String,
  recommendedTrackIds: [String],
  fileId: String, // optional uploaded PDF in File collection
}, { timestamps: true });

export const Prescription = mongoose.model('Prescription', prescriptionSchema);

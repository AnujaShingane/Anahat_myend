import mongoose from 'mongoose';

// Profile photos, health reports, prescription PDFs. ownerId = Postgres user UUID.
const fileSchema = new mongoose.Schema({
  ownerId: { type: String, required: true, index: true },
  kind: { type: String, enum: ['avatar', 'health_report', 'prescription', 'other'], required: true },
  filename: String,
  mimeType: String,
  size: Number,
  data: Buffer,
}, { timestamps: true });

export const File = mongoose.model('File', fileSchema);

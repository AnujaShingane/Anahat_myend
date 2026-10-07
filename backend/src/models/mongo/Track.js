import mongoose from 'mongoose';

const trackSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: String,
  chakra: String,          // root, sacral, ... (optional tag)
  category: { type: String, enum: ['therapy', 'relaxation'], default: 'therapy' },
  durationSec: Number,
  audioUrl: String,        // external URL (when the track links out rather than being uploaded)
  fileId: String,          // Mongo File _id (when the audio was uploaded directly)
  coverUrl: String,
  uploadedBy: String,      // admin / therapist user id
}, { timestamps: true });

export const Track = mongoose.model('Track', trackSchema);

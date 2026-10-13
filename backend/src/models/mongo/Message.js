import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true }, // `${patientId}_${therapistId}`
  senderId: { type: String, required: true },
  receiverId: { type: String, required: true },
  text: { type: String, required: true },
  readAt: Date,
}, { timestamps: true });

export const Message = mongoose.model('Message', messageSchema);

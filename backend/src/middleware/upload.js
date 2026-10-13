import multer from 'multer';

// Files are kept in memory and written to MongoDB by the controller.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    cb(ok.includes(file.mimetype) ? null : new Error('Only JPG, PNG, WEBP or PDF allowed'), ok.includes(file.mimetype));
  },
});

// Separate instance for admin-uploaded audio tracks (Music Library) — larger
// size limit, audio mimetypes only.
export const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a'];
    cb(ok.includes(file.mimetype) ? null : new Error('Only MP3, WAV, OGG or M4A audio files allowed'), ok.includes(file.mimetype));
  },
});

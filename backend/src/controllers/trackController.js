import { Track } from '../models/mongo/Track.js';
import { TrackPlay } from '../models/postgres/index.js';
import { saveFile, getFile } from '../services/fileService.js';

const DAILY_LIMIT = 2;
const today = () => new Date().toISOString().slice(0, 10);

export async function listTracks(req, res) {
  const category = req.query.category || 'therapy';
  const tracks = await Track.find({ category }).sort({ createdAt: -1 });
  const playedToday = await TrackPlay.findAll({ where: { patientId: req.user.id, playedOn: today() } });
  res.json({ tracks, playedToday: playedToday.map((p) => p.trackId), dailyLimit: DAILY_LIMIT });
}

// Admin: every track regardless of category, for the Audio Tracks admin
// section (add/remove).
export async function listAllTracksForAdmin(_req, res) {
  const tracks = await Track.find().sort({ createdAt: -1 });
  res.json({ tracks });
}

// Patient picks a therapy track: allowed only twice a day. Relaxation tracks are unlimited.
export async function playTrack(req, res) {
  const track = await Track.findById(req.params.id);
  if (!track) return res.status(404).json({ message: 'Track not found' });
  if (track.category === 'relaxation') return res.json({ track });

  const played = await TrackPlay.findAll({ where: { patientId: req.user.id, playedOn: today() } });
  const already = played.some((p) => p.trackId === track.id);
  if (!already && played.length >= DAILY_LIMIT) {
    return res.status(429).json({ message: `You can listen to ${DAILY_LIMIT} therapy tracks per day. Come back tomorrow.` });
  }
  if (!already) await TrackPlay.create({ patientId: req.user.id, trackId: track.id, playedOn: today() });
  res.json({ track });
}

// Admin / therapist adds a track — either an external audioUrl OR an
// uploaded audio file (multipart, field name "audio"), matching whichever
// the admin used in the form.
export async function createTrack(req, res) {
  if (!req.body.audioUrl && !req.file) {
    return res.status(400).json({ message: 'Provide either an audio URL or upload an audio file.' });
  }
  const fields = { ...req.body, uploadedBy: req.user.id };
  if (req.file) {
    fields.fileId = await saveFile(req.user.id, 'track_audio', req.file);
    delete fields.audioUrl;
  }
  const track = await Track.create(fields);
  res.status(201).json({ track });
}

export async function deleteTrack(req, res) {
  await Track.findByIdAndDelete(req.params.id);
  res.json({ message: 'Track removed' });
}

// Streams an uploaded track's audio back — mirrors the pattern used for
// profile files (see controllers/profileController.js getUserFile).
export async function streamTrackAudio(req, res) {
  const track = await Track.findById(req.params.id);
  if (!track?.fileId) return res.status(404).json({ message: 'No uploaded audio for this track' });
  const file = await getFile(track.fileId);
  if (!file) return res.status(404).json({ message: 'File not found' });
  res.set('Content-Type', file.mimeType);
  res.set('Content-Disposition', `inline; filename="${file.filename}"`);
  res.send(file.data);
}

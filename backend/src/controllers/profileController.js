import { User, PatientProfile, TherapistProfile } from '../models/postgres/index.js';
import { saveFile, getFile } from '../services/fileService.js';
import { sanitizeUser } from '../utils/sanitizeUser.js';
import { isValidPhone } from '../utils/phone.js';

// Patient onboarding form (step after sign up)
export async function completePatientProfile(req, res) {
  const u = req.user;
  const b = req.body;
  const problems = typeof b.problems === 'string' ? JSON.parse(b.problems) : b.problems || [];

  let healthReportFileId = null;
  if (req.files?.healthReport?.[0]) healthReportFileId = await saveFile(u.id, 'health_report', req.files.healthReport[0]);
  if (req.files?.avatar?.[0]) u.avatarFileId = await saveFile(u.id, 'avatar', req.files.avatar[0]);

  await PatientProfile.upsert({
    userId: u.id, age: b.age, gender: b.gender, occupation: b.occupation, maritalStatus: b.maritalStatus,
    disease: b.disease, problems, problemDescription: b.problemDescription,
    caregiverName: b.caregiverName || null, caregiverRelation: b.caregiverRelation || null,
    ...(healthReportFileId && { healthReportFileId }),
  });
  await u.update({ firstName: b.firstName || u.firstName, lastName: b.lastName ?? u.lastName, phone: b.phone || u.phone, isProfileComplete: true, avatarFileId: u.avatarFileId });
  res.json({ user: sanitizeUser(u) });
}

// Therapist onboarding form
export async function completeTherapistProfile(req, res) {
  const u = req.user;
  const b = req.body;
  if (!req.file) return res.status(400).json({ message: 'Profile photo is required.' });
  u.avatarFileId = await saveFile(u.id, 'avatar', req.file);

  await TherapistProfile.upsert({
    userId: u.id, age: b.age, gender: b.gender, experienceYears: b.experienceYears,
    experienceDetails: b.experienceDetails, profession: b.profession, fee: b.fee, address: b.address, bio: b.bio || null,
  });
  await u.update({ firstName: b.firstName || u.firstName, lastName: b.lastName ?? u.lastName, phone: b.phone || u.phone, isProfileComplete: true, avatarFileId: u.avatarFileId });
  res.json({ user: sanitizeUser(u) });
}

export async function getMyProfile(req, res) {
  const include = req.user.role === 'patient' ? 'patientProfile' : req.user.role === 'therapist' ? 'therapistProfile' : null;
  const user = await User.findByPk(req.user.id, { attributes: { exclude: ['passwordHash'] }, include: include ? [include] : [] });
  res.json({ user });
}

export async function updateAvatar(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No image uploaded' });
  const id = await saveFile(req.user.id, 'avatar', req.file);
  await req.user.update({ avatarFileId: id });
  res.json({ avatarFileId: id });
}

// Streams an uploaded file (avatar / report / prescription) from Mongo.
export async function serveFile(req, res) {
  const file = await getFile(req.params.id);
  if (!file) return res.status(404).json({ message: 'File not found' });
  const isOwner = file.ownerId === req.user.id;
  const isAvatar = file.kind === 'avatar';
  const isStaff = ['admin', 'therapist'].includes(req.user.role);
  if (!isOwner && !isAvatar && !isStaff) return res.status(403).json({ message: 'Not allowed' });
  res.set('Content-Type', file.mimeType);
  res.set('Content-Disposition', `inline; filename="${file.filename}"`);
  res.send(file.data);
}


// PATCH /api/profile/contact — any signed-in user (patient, therapist or
// admin) can update their own contact number.
export async function updateContact(req, res) {
  const phone = String(req.body.phone || '').trim();
  if (phone && !isValidPhone(phone)) {
    return res.status(400).json({ message: 'Enter a valid mobile number (10-digit Indian, or international with country code).' });
  }
  await req.user.update({ phone: phone || null });
  res.json({ user: sanitizeUser(req.user) });
}

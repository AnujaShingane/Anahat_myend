// Shapes a real Postgres therapist record (source of truth for identity +
// approval status, from GET /api/admin/users?role=therapist) into what the
// admin tab components expect, enriched with the extra sign-up survey
// fields (qualification, specializations) that have no Postgres column.
// Shared by Anahat Admin and Technical Admin so there's exactly one place
// that decides what "pending" vs "approved" means.
export function adaptTherapist(u, surveyByUserId = {}) {
  const survey = surveyByUserId[u.id] || {};
  const tp = u.therapistProfile || {};
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
  const approvalStatus = !u.isProfileComplete ? 'not_submitted' : u.isApproved ? 'approved' : 'pending';
  return {
    id: u.id,
    name,
    email: u.email,
    age: tp.age ?? survey.age,
    gender: tp.gender ?? survey.gender,
    qualification: tp.profession ?? survey.qualification,
    yearsExperience: tp.experienceYears ? `${tp.experienceYears} years` : survey.yearsExperience,
    specializations: survey.specializations || [],
    bio: tp.bio,
    fee: tp.fee,
    address: tp.address,
    avatarFileId: u.avatarFileId,
    isProfileComplete: u.isProfileComplete,
    isApproved: u.isApproved,
    isSuspended: u.isSuspended,
    approvalStatus,
    verified: u.isApproved,
    level: tp.profession,
    role: 'therapist',
    patients: [],
    profile: {
      fullName: name,
      avatarUrl: u.avatarFileId ? `/api/profile/files/${u.avatarFileId}` : undefined,
      sessionFee: tp.fee,
      bio: tp.bio,
    },
  };
}

// Shapes a real Postgres patient record for the admin patient directory.
export function adaptPatient(u) {
  return {
    id: u.id,
    name: [u.firstName, u.lastName].filter(Boolean).join(' '),
    email: u.email,
    avatarFileId: u.avatarFileId,
    patientProfile: u.patientProfile,
    accountType: u.accountType,
    createdAt: u.createdAt,
  };
}

// Shapes any Postgres user (any role) for the Technical Admin account
// directory.
export function adaptAccount(u) {
  return {
    id: u.id,
    name: [u.firstName, u.lastName].filter(Boolean).join(' '),
    email: u.email,
    role: u.role,
    accountType: u.accountType,
    isApproved: u.isApproved,
    isProfileComplete: u.isProfileComplete,
    isSuspended: u.isSuspended,
    status: u.isSuspended ? 'suspended' : 'active',
    avatarFileId: u.avatarFileId,
    createdAt: u.createdAt,
  };
}

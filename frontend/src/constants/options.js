// ---------------------------------------------------------------------------
// options.js
//
// Static reference data (dropdown option lists, mood scale, track catalog
// palette) — not per-user content, so it doesn't belong behind a database
// call the way patient/therapist data does. Moved out of the old
// mockApi.js as part of removing the localStorage fake backend.
//
// BACKEND TEAM: these are fine to leave as shipped frontend constants. If
// you'd rather manage them centrally (e.g. so they can change without a
// frontend deploy), expose a single `GET /api/config` endpoint returning
// this same shape and swap the import in consuming files — nothing else
// needs to change.
// ---------------------------------------------------------------------------

export const CONCERN_OPTIONS = [
  'Anxiety', 'Depression', 'Stress & Burnout', 'Sleep Issues',
  'Relationship & Family', 'Grief & Loss',
  'Addiction Recovery', 'Anger Management', 'General Wellness',
  'Please Specify',
];

export const GENDER_OPTIONS = ['Female', 'Male', 'Non-binary', 'Prefer not to say'];
export const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', "Don't know"];
export const EXPERIENCE_OPTIONS = ['0-2 years', '3-5 years', '6-10 years', '10+ years'];
export const CHAKRAS = [
  'Root Chakra', 'Sacral Chakra', 'Solar Plexus Chakra', 'Heart Chakra',
  'Throat Chakra', 'Third Eye Chakra', 'Crown Chakra',
];
export const QUALIFICATION_OPTIONS = [
  'Certified Counselor', 'Clinical Psychologist', 'Psychiatrist',
  'Music Therapist', 'Other',
];

export const ONBOARDING_CONFIG = {
  genders: ['Male', 'Female', 'Non-binary', 'Prefer not to say'],
  bloodGroups: BLOOD_GROUP_OPTIONS,
  countries: ['India', 'United States', 'United Kingdom', 'Canada', 'Australia', 'Other'],
  occupations: ['Student', 'Salaried Employee', 'Self-Employed', 'Homemaker', 'Unemployed', 'Retired', 'Other'],
  educationLevels: ['High School', "Bachelor's Degree", "Master's Degree", 'Doctorate', 'Other'],
  maritalStatuses: ['Single', 'Married', 'Divorced', 'Widowed', 'Prefer not to say'],
  sleepPatterns: ['Regular (7-9 hrs)', 'Irregular', 'Insomnia', 'Oversleeping', 'Not sure'],
  referralSources: ['Social Media', 'Friend or Family', 'Search Engine', 'Healthcare Provider', 'Doctor Referral', 'Advertisement', 'Other'],
  concerns: CONCERN_OPTIONS,
};

export function getOnboardingConfig() {
  return ONBOARDING_CONFIG;
}

export const MOOD_SCALE = [
  { value: 1, label: 'Struggling', emoji: '😔' },
  { value: 2, label: 'Low', emoji: '🙁' },
  { value: 3, label: 'Okay', emoji: '😐' },
  { value: 4, label: 'Good', emoji: '🙂' },
  { value: 5, label: 'Great', emoji: '😄' },
];

export function getMoodScale() {
  return MOOD_SCALE;
}

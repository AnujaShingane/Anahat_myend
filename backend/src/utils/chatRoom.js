// Deterministic room id so patient and therapist always land in the same room.
export const roomIdFor = (patientId, therapistId) => `${patientId}_${therapistId}`;

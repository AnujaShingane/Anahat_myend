// One place that turns a raw user record into the fields the UI shows.
// Handles the "Ishwari Ishwari" case (single-word sign-up stored as first
// and last name) and exposes a photo URL when one is uploaded.
export function displayNameOf(u) {
  if (!u) return '';
  const first = (u.firstName || u.first_name || '').trim();
  const last = (u.lastName || u.last_name || '').trim();
  if (first && last && first.toLowerCase() === last.toLowerCase()) return first;
  const joined = [first, last].filter(Boolean).join(' ');
  return joined || u.name || u.full_name || '';
}

export function avatarUrlOf(u) {
  if (!u) return null;
  if (u.avatarUrl) return u.avatarUrl;
  if (u.picture) return u.picture;
  if (u.avatarFileId) return `/api/profile/files/${u.avatarFileId}`;
  return null;
}

export function normalizeUser(u) {
  if (!u) return u;
  const name = displayNameOf(u);
  return { ...u, name, full_name: name, first_name: (u.firstName || u.first_name || name.split(' ')[0] || ''), avatarUrl: avatarUrlOf(u) };
}

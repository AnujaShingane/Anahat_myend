const ASSET_ROOT = '/assets/relaxation';

export const RELAXATION_ARTWORK_BY_CONCERN = {
  anger: `${ASSET_ROOT}/WhatsApp Image 2026-09-26 at 4.51.12 PM.jpeg`,
  frustration: `${ASSET_ROOT}/WhatsApp Image 2026-09-26 at 4.51.09 PM.jpeg`,
  stress: `${ASSET_ROOT}/WhatsApp Image 2026-09-26 at 4.51.05 PM.jpeg`,
  anxiety: `${ASSET_ROOT}/WhatsApp Image 2026-09-26 at 4.51.14 PM.jpeg`,
  sadness: `${ASSET_ROOT}/WhatsApp Image 2026-09-26 at 4.51.11 PM.jpeg`,
  overthinking: `${ASSET_ROOT}/WhatsApp Image 2026-09-26 at 4.51.07 PM.jpeg`,
  sleep: `${ASSET_ROOT}/WhatsApp Image 2026-09-26 at 4.51.10 PM.jpeg`,
  restlessness: `${ASSET_ROOT}/WhatsApp Image 2026-09-26 at 4.51.04 PM.jpeg`,
  loneliness: `${ASSET_ROOT}/WhatsApp Image 2026-09-26 at 4.51.04 PM.jpeg`,
  fear: `${ASSET_ROOT}/WhatsApp Image 2026-09-26 at 4.51.14 PM.jpeg`,
  burnout: `${ASSET_ROOT}/WhatsApp Image 2026-09-26 at 4.51.05 PM.jpeg`,
  motivation: `${ASSET_ROOT}/WhatsApp Image 2026-09-26 at 4.51.07 PM.jpeg`,
  grief: `${ASSET_ROOT}/WhatsApp Image 2026-09-26 at 4.51.11 PM.jpeg`,
  focus: `${ASSET_ROOT}/WhatsApp Image 2026-09-26 at 4.51.08 PM.jpeg`,
};

export const RELAXATION_CONCERNS = [
  { key: 'restlessness', label: 'Finding Calmness', description: 'Settle your mind and return to balance.' },
  { key: 'stress', label: 'Reduce Stress', description: 'Unwind and release built-up pressure.' },
  { key: 'overthinking', label: 'Mindful Meditation', description: 'Reconnect with the present moment.' },
  { key: 'focus', label: 'Focus', description: 'Find clarity and concentration.' },
  { key: 'frustration', label: 'Ease Frustration', description: 'Release tension and reset.' },
  { key: 'sleep', label: 'Invite Sleep', description: 'Prepare for restful sleep.' },
  { key: 'sadness', label: 'Mild Mood Shifting', description: 'Gently support a brighter mood.' },
  { key: 'anger', label: 'Release Anger', description: 'Release intensity and restore calm.' },
  { key: 'anxiety', label: 'Reduce Anxiety', description: 'Breathe steadily and find grounding.' },
].map((concern) => ({ ...concern, image: RELAXATION_ARTWORK_BY_CONCERN[concern.key] }));

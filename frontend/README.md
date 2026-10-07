# Anahat / Nadika.AI — Frontend

React + Vite + Tailwind frontend. No functionality was changed in this refactor —
only how the code is organized, styled, and bundled.

## Project structure

```
src/
  app/              App.jsx — route table only. Owns nothing else.
  pages/            One folder per user-facing area, one file per screen.
    marketing/      Public landing page.
    auth/           Login, Register, RoleSelect, GetStarted.
    patient/        Onboarding, Dashboard, ChooseJourney, RelaxationSession, ReportPage.
    consultation/   The "Professional Consultation" flow (its own sidebar layout).
    caregiver/      Caregiver access request + dashboard + report views.
    therapist/      Therapist console + patient profile.
    admin/          Admin console.
  features/
    chat/           The 3D avatar/chat experience (Experience, ChatUI, useChat,
                     ChatPage). Kept isolated because it pulls in three.js /
                     react-three-fiber — the heaviest dependency in the app —
                     and is lazy-loaded (see Performance below).
  components/       Shared, feature-agnostic building blocks used by 2+ pages
                     (ProtectedRoute, RoleProtectedRoute, Avatar, Feedback,
                     ChakraTrendChart, ListeningSessionTimer, TrackVisual).
    ui/Kit.jsx       The design system: Card, SectionHeading, PageShell,
                     PrimaryButton/OutlineButton, Badge, TextField,
                     TextAreaField, SelectField, StatCard, Tabs, EmptyState.
                     Every page is built from these — change spacing/color/
                     radius here and it updates everywhere consistently.
  context/          AuthContext (session/auth state).
  services/         mockApi.js — the entire data layer (patients, therapists,
                     appointments, reports, feedback, etc). Every page reads
                     and writes through this file's exported functions, never
                     through localStorage directly. Swapping this app onto a
                     real backend means rewriting the *inside* of these
                     functions to call your API instead of localStorage —
                     no page-level code should need to change.
  hooks/, assets/, index.css, main.jsx
```

## Design system

Don't hand-roll spacing/colors/borders on a new page. Compose it from
`src/components/ui/Kit.jsx`:

- `PageShell` — the page-level scroll container (fixed to viewport height,
  internally scrollable — required because `#root` in `index.css` is
  `height: 100vh; overflow: hidden`).
- `Card`, `SectionHeading`, `StatCard`, `Tabs`, `Badge` — layout primitives.
- `PrimaryButton`, `OutlineButton`, `TextField`, `TextAreaField`,
  `SelectField` — form/action primitives.
- `EmptyState` — use this instead of writing a one-off "nothing here yet"
  block; it's what shows on the Book Appointment page when no therapists
  have registered.

## Data layer

`src/services/mockApi.js` is a localStorage-backed mock of a real backend.
Every `get*`/`save*`/`set*` function in it is the seam where a real API call
belongs later. Nothing in `src/pages/**` talks to `localStorage` directly —
that discipline is what makes the backend swap non-invasive.

There is no hardcoded demo content anywhere in the data layer (no seed
therapists, patients, or stats) — everything renders from what's actually
been created through the app, and empty states are shown when there's
nothing yet.

## Performance

The 3D avatar/chat experience (`features/chat/ChatPage.jsx`, which pulls in
`three`, `@react-three/fiber`, `@react-three/drei`, `leva`) is lazy-loaded
(`React.lazy` + `Suspense`) from `App.jsx` and only downloaded when a user
visits `/chat`. This cut the main JS bundle from ~1.66 MB to ~400 KB
(gzip ~472 KB → ~105 KB) for every other page in the app.

## Images

A few pages reference optional images that aren't included in this repo
(kept out so nothing fake ships): `public/assets/self-care.jpg` on the
Relaxation Session screen and `public/assets/caregiver-support.jpg` on the
Caregiver Dashboard. Both are wrapped so the layout looks correct with or
without the file present — drop a photo in at that path and it appears
automatically, no code change needed.

## Commands

```
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
npm run preview  # preview the production build
```

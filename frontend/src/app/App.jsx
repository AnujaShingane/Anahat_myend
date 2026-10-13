import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LandingPage from "../pages/marketing/LandingPage";
import About from "../pages/marketing/About";
import DemoPage from "../pages/marketing/DemoPage";
import Login from "../pages/auth/Login";
import AuthCallback from "../pages/auth/AuthCallback";
import Register from "../pages/auth/Register";
import Onboarding from "../pages/patient/Onboarding";
import Consent from "../pages/patient/Consent";
import DemoPrompt from "../pages/patient/DemoPrompt";
import PatientPendingApproval from "../pages/patient/PendingApproval";
import RelaxationSession from "../pages/patient/RelaxationSession";
import RelaxationPaymentPage from "../pages/patient/RelaxationPaymentPage";
import DocumentUpload from "../pages/consultation/DocumentUpload";
import MusicPreference from "../pages/consultation/MusicPreference";
import WeeklyFeedback from "../pages/consultation/WeeklyFeedback";
import ActivityCheckIn from "../pages/consultation/ActivityCheckIn";
import TherapistOnboardingSurvey from "../pages/therapist/TherapistOnboardingSurvey";
import PendingApproval from "../pages/therapist/PendingApproval";
import LiveSession from "../pages/therapist/LiveSession";
import CaregiverAccessRequest from "../pages/caregiver/CaregiverAccessRequest";
import CaregiverStatus from "../pages/caregiver/CaregiverStatus";
import CaregiverDashboard from "../pages/caregiver/CaregiverDashboard";
import CaregiverReportPage from "../pages/caregiver/CaregiverReportPage";
import Dashboard from "../pages/patient/Dashboard";
import BookSession from "../pages/patient/BookSession";
import FindTherapist from "../pages/patient/FindTherapist";
import TherapistProfilePage from "../pages/patient/TherapistProfilePage";
import Appointments from "../pages/patient/Appointments";
import Tracking from "../pages/patient/Tracking";
import Messages from "../pages/patient/Messages";
import Notifications from "../pages/patient/Notifications";
import Reports from "../pages/patient/Reports";
import Profile from "../pages/patient/Profile";
import Settings from "../pages/patient/Settings";
import ReportPage from "../pages/patient/ReportPage";
import TherapistPortal from "../pages/therapist/TherapistPortal";
import PatientProfile from "../pages/therapist/PatientProfile";
import SessionReportBuilder from "../pages/therapist/SessionReportBuilder";
import AdminRoleSelect from "../pages/admin/AdminRoleSelect";
import TechnicalAdminPortal from "../pages/admin/technical/TechnicalAdminPortal";
import AnahatAdminPortal from "../pages/admin/anahat/AnahatAdminPortal";
import ProtectedRoute from "../components/ProtectedRoute";
import RoleProtectedRoute from "../components/RoleProtectedRoute";
import Feedback from '../components/Feedback';

// Code-split: the 3D avatar experience (three.js + react-three-fiber) is the
// heaviest dependency in the app and is only needed on /chat, so it's loaded
// on demand instead of shipping in everyone's initial bundle.
const ChatPage = lazy(() => import("../features/chat/ChatPage"));

function App() {
  const location = useLocation();
  const therapistMessaging = location.pathname === '/therapist' && new URLSearchParams(location.search).get('tab') === 'messages';
  const onDashboardChat = location.pathname === '/dashboard/messages' || therapistMessaging;
  return (
    <>
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/about" element={<About />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/begin" element={<Navigate to="/register" replace />} />
      <Route path="/role-select" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/register" element={<Register />} />
      <Route path="/caregiver-access" element={<CaregiverAccessRequest />} />

      {/* Patient onboarding / journey selection */}
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/consent" element={<ProtectedRoute><Consent /></ProtectedRoute>} />
      <Route path="/demo-prompt" element={<ProtectedRoute><DemoPrompt /></ProtectedRoute>} />
      <Route path="/onboarding/pending" element={<ProtectedRoute><PatientPendingApproval /></ProtectedRoute>} />
      <Route path="/relaxation/payment" element={<ProtectedRoute><RelaxationPaymentPage /></ProtectedRoute>} />
      <Route path="/relaxation" element={<Navigate to="/dashboard/relaxation" replace />} />
      <Route path="/relaxation/intake" element={<Navigate to="/dashboard/relaxation" replace />} />
      <Route path="/dashboard/relaxation" element={<ProtectedRoute><RelaxationSession /></ProtectedRoute>} />

      {/* Professional Consultation flow — each page renders on PatientDashboardLayout directly */}
      <Route path="/consultation/documents" element={<ProtectedRoute><DocumentUpload /></ProtectedRoute>} />
      <Route path="/consultation" element={<Navigate to="/register?journey=consultation" replace />} />
      <Route path="/consultation/appointment" element={<Navigate to="/dashboard/book-session" replace />} />
      <Route path="/consultation/music" element={<ProtectedRoute><MusicPreference /></ProtectedRoute>} />
      <Route path="/consultation/feedback" element={<ProtectedRoute><WeeklyFeedback /></ProtectedRoute>} />
      <Route path="/consultation/activities" element={<ProtectedRoute><ActivityCheckIn /></ProtectedRoute>} />

      {/* Therapist Routes */}
      <Route
        path="/therapist/onboarding-survey"
        element={
          <RoleProtectedRoute allow={['therapist']}>
            <TherapistOnboardingSurvey />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/therapist/pending-approval"
        element={
          <RoleProtectedRoute allow={['therapist']}>
            <PendingApproval />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/therapist"
        element={
          <RoleProtectedRoute allow={['therapist']}>
            <TherapistPortal />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/therapist/patient/:patientId"
        element={
          <RoleProtectedRoute allow={['therapist']}>
            <PatientProfile />
          </RoleProtectedRoute>
        }
      />
      <Route path="/therapist/report/:patientId" element={<RoleProtectedRoute allow={['therapist', 'admin']}><SessionReportBuilder /></RoleProtectedRoute>} />
      {/* ANAHAT assessment lives inside the offline Nadika.ai session (/therapist/session/:patientId?mode=offline) */}
      <Route
        path="/therapist/session/:patientId"
        element={
          <RoleProtectedRoute allow={['therapist']}>
            <LiveSession />
          </RoleProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <RoleProtectedRoute allow={['admin']}>
            <AdminRoleSelect />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/technical-admin/dashboard"
        element={
          <RoleProtectedRoute allow={['admin']}>
            <TechnicalAdminPortal />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/anahat-admin/dashboard"
        element={
          <RoleProtectedRoute allow={['admin']}>
            <AnahatAdminPortal />
          </RoleProtectedRoute>
        }
      />
      {/* Legacy static admin pages kept for backwards compatibility */}
      <Route path="/admin/login" element={<AdminLoginRedirect />} />
      <Route path="/admin/dashboard" element={<AdminDashboardRedirect />} />

      {/* Protected Patient Routes */}
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
      <Route
        path="/dashboard/book-session"
        element={
          <ProtectedRoute>
            <BookSession />
          </ProtectedRoute>
        }
      />
      <Route path="/dashboard/find-therapist" element={<ProtectedRoute><FindTherapist /></ProtectedRoute>} />
      <Route path="/dashboard/therapists/:therapistId" element={<ProtectedRoute><TherapistProfilePage /></ProtectedRoute>} />
      <Route
        path="/dashboard/appointments"
        element={
          <ProtectedRoute>
            <Appointments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/tracking"
        element={
          <ProtectedRoute>
            <Tracking />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/messages"
        element={
          <ProtectedRoute>
            <Messages />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/notifications"
        element={
          <ProtectedRoute>
            <Notifications />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/reports"
        element={
          <ProtectedRoute>
            <Reports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/caregiver-status"
        element={
          <ProtectedRoute>
            <CaregiverStatus />
          </ProtectedRoute>
        }
      />
      <Route
        path="/caregiver"
        element={
          <ProtectedRoute>
            <CaregiverDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/caregiver/report/:sessionId"
        element={
          <ProtectedRoute>
            <CaregiverReportPage />
          </ProtectedRoute>
        }
      />
      <Route path="/feedback/:sessionId" element={
  <ProtectedRoute>
    <Feedback />
  </ProtectedRoute>
} />
      <Route 
        path="/chat" 
        element={
          <ProtectedRoute>
            <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-[#FDF6EE] text-slate-500 text-sm font-bold uppercase tracking-widest">Loading session…</div>}>
              <ChatPage />
            </Suspense>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/report/:sessionId" 
        element={
          <ProtectedRoute>
            <ReportPage />
          </ProtectedRoute>
        } 
      />
      
      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
      
    </Routes>
    {!location.pathname.startsWith('/therapist/session/') && !onDashboardChat && <a
      href="https://wa.me/919657317561?text=Hello%20Anahat"
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with Anahat on WhatsApp"
      title="Chat with Anahat on WhatsApp"
      className="fixed bottom-5 right-5 z-[80] flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#128C7E]"
    >
      <WhatsAppIcon />
    </a>}
    </>
  );
}

function WhatsAppIcon() {
  return <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 12.1 0C5.6 0 .3 5.3.3 11.8c0 2.1.5 4.1 1.6 5.9L.2 24l6.5-1.7a11.8 11.8 0 0 0 5.4 1.3h.1c6.5 0 11.8-5.3 11.8-11.8 0-3.1-1.2-6.1-3.5-8.3ZM12.2 21.6c-1.7 0-3.4-.5-4.8-1.3l-.3-.2-3.9 1 1-3.8-.2-.4a9.7 9.7 0 0 1-1.5-5.1 9.8 9.8 0 0 1 16.7-6.9 9.7 9.7 0 0 1 2.9 6.9c0 5.4-4.5 9.8-9.9 9.8Zm5.4-7.3c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.2-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.4-1.5-.9-.8-1.5-1.7-1.7-2-.2-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.1c-.2-.5-.5-.4-.7-.4h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.1 3c.1.2 2 3.1 4.9 4.3.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4 0-.1-.2-.2-.5-.3Z" /></svg>;
}

// Helper components to redirect to HTML pages
function AdminLoginRedirect() {
  window.location.href = '/admin-login.html';
  return null;
}

function AdminDashboardRedirect() {
  window.location.href = '/admin-dashboard.html';
  return null;
}

export default App;
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { WaveBackground } from "./components/WaveBackground";
import { Toaster } from "./components/ui/sonner";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import UserApp from "./pages/UserApp";
import { ThemeProvider } from "next-themes";

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/app" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<WaveBackground><Login /></WaveBackground>} />
            
            <Route path="/app" element={
              <ProtectedRoute>
                <UserApp />
              </ProtectedRoute>
            } />

            <Route path="/dashboard" element={
              <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
                <WaveBackground><Dashboard /></WaveBackground>
              </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/app" />} />
          </Routes>
          <Toaster />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

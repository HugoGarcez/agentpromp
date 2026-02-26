import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/Layout/MainLayout';
import Dashboard from './pages/Dashboard';
import AIConfig from './pages/AIConfig';
import ProductConfig from './pages/ProductConfig';
import SchedulingConfig from './pages/SchedulingConfig';
import TestAI from './pages/TestAI';
import Settings from './pages/Settings';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminDashboard from './pages/AdminDashboard';
import AdminConfig from './pages/AdminConfig';
import TagAutomation from './pages/TagAutomation';
import Integrations from './pages/Integrations';

import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        Carregando...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div>Carregando...</div>;
  if (!user || user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return children;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route path="/" element={
              <PrivateRoute>
                <MainLayout />
              </PrivateRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="ai-config" element={<AIConfig />} />
              <Route path="test-ai" element={<TestAI />} />
              <Route path="products" element={<ProductConfig />} />
              <Route path="automation" element={<TagAutomation />} />
              <Route path="scheduling" element={<SchedulingConfig />} />
              <Route path="settings" element={<Settings />} />
              <Route path="integrations" element={<Integrations />} />

              <Route path="admin" element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              } />

              <Route path="admin-config" element={
                <AdminRoute>
                  <AdminConfig />
                </AdminRoute>
              } />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider >
  );
}

export default App;

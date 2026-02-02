import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './components/Layout/MainLayout';
import Dashboard from './pages/Dashboard';
import AIConfig from './pages/AIConfig';
import ProductConfig from './pages/ProductConfig';
import TestAI from './pages/TestAI';
import Settings from './pages/Settings';

import { ThemeProvider } from './contexts/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="ai-config" element={<AIConfig />} />
            <Route path="test-ai" element={<TestAI />} />
            <Route path="products" element={<ProductConfig />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;

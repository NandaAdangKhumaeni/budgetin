import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Transaction from './pages/Transaction';
import Target from './pages/Target';
import Bank from './pages/Bank';
import Investment from './pages/Investment';
import Bill from './pages/Bill';
import Report from './pages/Report';
import Login from './pages/Login';

function App() {
  return (
    <Router>
      <Routes>
        {/* PUBLIC ROUTE */}
        <Route path="/login" element={<Login />} />
        
        {/* PROTECTED ROUTES W/ LAYOUT */}
        <Route path="/*" element={
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/transaction" element={<Transaction />} />
              <Route path="/target" element={<Target />} />
              <Route path="/bank" element={<Bank />} />
              <Route path="/investment" element={<Investment />} />
              <Route path="/bill" element={<Bill />} />
              <Route path="/report" element={<Report />} />
              {/* Catch all redirect to dashboard */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        } />
      </Routes>
    </Router>
  );
}

export default App;

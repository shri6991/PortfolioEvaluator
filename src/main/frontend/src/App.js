import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

// Components
import Navigation from './components/Navigation';

// Pages
import Dashboard from './pages/Dashboard';
import ImportPortfolio from './pages/ImportPortfolio';
import PortfolioDetail from './pages/PortfolioDetail';

// Context
import { PortfolioProvider } from './context/PortfolioContext';

function App() {
  return (
    <PortfolioProvider>
      <Router>
        <div className="d-flex flex-column min-vh-100">
          <Navigation />
          
          <main className="flex-grow-1 py-4">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/import" element={<ImportPortfolio />} />
              <Route path="/portfolio" element={<PortfolioDetail />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          
          <footer className="bg-light py-3 text-center">
            <div className="container">
              <p className="mb-0">Portfolio Evaluator &copy; {new Date().getFullYear()}</p>
            </div>
          </footer>
        </div>
      </Router>
    </PortfolioProvider>
  );
}

export default App; 
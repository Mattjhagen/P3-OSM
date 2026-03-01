import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DeveloperDashboard from './pages/dashboard';
import PricingPage from './pages/pricing';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DeveloperDashboard />} />
        <Route path="/pricing" element={<PricingPage />} />
      </Routes>
    </BrowserRouter>
  );
}

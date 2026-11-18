import { Navigate, Route, Routes } from 'react-router-dom';
import { CustomerLayout, DashboardLayout } from './layouts/Layouts';
import { Protected, Empty } from './components/shared';
import AuthPage from './pages/customer/AuthPage';
import { VenuesPage, VenueDetailPage } from './pages/customer/Venues';
import SchedulePage from './pages/customer/Schedule';
import CheckoutPage from './pages/customer/Checkout';
import MyBookingsPage from './pages/customer/MyBookings';
import ManagerVenuesPage from './pages/manager/Venues';
import CounterPage from './pages/manager/Counter';
import RequestsPage from './pages/manager/Requests';
import AdminPage from './pages/admin/Admin';
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/register" element={<AuthPage register />} />
      <Route element={<CustomerLayout />}>
        <Route index element={<Navigate to="/venues" replace />} />
        <Route path="/venues" element={<VenuesPage />} />
        <Route path="/venues/:id" element={<VenueDetailPage />} />
        <Route path="/courts/:id/schedule" element={<SchedulePage />} />
        <Route element={<Protected roles={['CUSTOMER']} />}>
          <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
          <Route path="/my-bookings" element={<MyBookingsPage />} />
        </Route>
        <Route path="*" element={<Empty>Trang bạn tìm không tồn tại.</Empty>} />
      </Route>
      <Route element={<Protected roles={['VENUE_MANAGER']} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/manager/venues" element={<ManagerVenuesPage />} />
          <Route path="/manager/counter" element={<CounterPage />} />
          <Route path="/manager/requests" element={<RequestsPage />} />
        </Route>
      </Route>
      <Route element={<Protected roles={['ADMIN']} />}>
        <Route element={<DashboardLayout admin />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

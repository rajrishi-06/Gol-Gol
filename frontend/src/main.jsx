import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/inter";
import "./index.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Toaster from "./components/ui/Toaster.jsx";
import { AuthProvider } from "./lib/auth.jsx";
import { ConnectionProvider } from "./lib/connection.jsx";
import { ActiveRideProvider } from "./lib/activeRide.jsx";
import { BookingProvider } from "./lib/booking.jsx";
import { registerServiceWorker } from "./lib/pwa.js";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ConnectionProvider>
          <AuthProvider>
            <ActiveRideProvider>
              <BookingProvider>
                <App />
              </BookingProvider>
            </ActiveRideProvider>
          </AuthProvider>
        </ConnectionProvider>
      </BrowserRouter>
      <Toaster />
    </ErrorBoundary>
  </StrictMode>
);

registerServiceWorker();

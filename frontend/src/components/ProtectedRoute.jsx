// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ logIn, children }) {
  if (!logIn) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

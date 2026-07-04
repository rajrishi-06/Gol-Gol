import { useLocation } from "react-router-dom";
import BrandAside from "./BrandAside";

/** Chooses aside copy from the current route. */
function variantForPath(pathname) {
  if (pathname.startsWith("/login")) return "login";
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/driver")) return "driver";
  return "default";
}

/**
 * Kept as `RightPanel` for import compatibility, but now renders the
 * self-contained animated brand aside instead of a hot-linked stock photo.
 */
export default function RightPanel() {
  const { pathname } = useLocation();
  return <BrandAside variant={variantForPath(pathname)} />;
}

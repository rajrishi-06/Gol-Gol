import { useEffect } from "react";

/**
 * Sets document.title on mount and reverts to the base title on unmount.
 * Usage:  useDocumentTitle("Dashboard");
 *         → "Dashboard — Gol·Gol"
 */
export function useDocumentTitle(pageTitle) {
  useEffect(() => {
    const prev = document.title;
    document.title = pageTitle ? `${pageTitle} — Gol·Gol` : "Gol·Gol";
    return () => {
      document.title = prev;
    };
  }, [pageTitle]);
}

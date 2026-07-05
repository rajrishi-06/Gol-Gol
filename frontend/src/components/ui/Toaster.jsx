import { useEffect, useState } from "react";
import { Toaster as SonnerToaster } from "sonner";

/**
 * App toast surface (Sonner), kept in sync with the app's `data-theme`.
 * Positioned top-center so ride status alerts read clearly on mobile.
 */
export default function Toaster() {
  const [theme, setTheme] = useState(() =>
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light"
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() =>
      setTheme(root.getAttribute("data-theme") === "dark" ? "dark" : "light")
    );
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return (
    <SonnerToaster
      theme={theme}
      position="top-center"
      richColors
      closeButton
      gap={10}
      toastOptions={{
        style: { borderRadius: "14px" },
      }}
    />
  );
}

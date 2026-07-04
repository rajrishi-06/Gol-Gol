import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

/**
 * Guards driver-only routes: requires a logged-in user whose `drivers` record
 * is `approved`, and marks them online in `active_drivers` on entry.
 *
 * Hooks are always called in the same order (the early `logIn` return lives
 * below them) to satisfy the rules of hooks.
 */
export default function ProtectedDriverRoute({ logIn, children }) {
  const [status, setStatus] = useState("loading");
  const navigate = useNavigate();

  useEffect(() => {
    if (!logIn) return;
    (async () => {
      const user_uuid = localStorage.getItem("user_uuid");
      if (!user_uuid) {
        setStatus("unauthorized");
        navigate("/");
        return;
      }
      const { data: driver, error } = await supabase
        .from("drivers")
        .select("verification_status")
        .eq("user_id", user_uuid)
        .maybeSingle();

      if (error) {
        setStatus("unauthorized");
        navigate("/");
        return;
      }
      if (driver?.verification_status === "approved") {
        setStatus("approved");
        try {
          await supabase.from("active_drivers").upsert(
            { user_id: user_uuid, is_online: true, last_active_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
        } catch {
          /* non-fatal */
        }
      } else {
        setStatus("unauthorized");
        navigate("/driver/activate");
      }
    })();
  }, [logIn, navigate]);

  if (!logIn) return <Navigate to="/" replace />;
  if (status === "approved") return <>{children}</>;

  return (
    <div className="flex h-[100dvh] items-center justify-center bg-background">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">Verifying access</h2>
        <p className="mt-2 text-sm text-muted">Checking your driver credentials…</p>
      </div>
    </div>
  );
}

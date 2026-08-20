import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { DRIVING_MODES, currentMode, setUserMode } from "./pooling";

/**
 * Single source of truth for "who is using the app".
 *
 * The app previously read `localStorage.getItem("user_uuid")` in sixteen places
 * and used that client-writable string as the primary key for every query, so a
 * cleared (or stale) localStorage silently broke booking, chat and the driver
 * dashboard. Identity now comes from the Supabase session; the profile, driver
 * record and settings are loaded once and shared.
 */

const AuthContext = createContext(null);

// Module-level mirror so non-React helpers (notify, liveLocation, …) can read
// the current user synchronously without threading props everywhere.
let currentUserId = null;
export function getUserId() {
  return currentUserId;
}

const EMPTY = {
  session: null,
  user: null,
  profile: null,
  driver: null,
  settings: null,
};

export function AuthProvider({ children }) {
  const [state, setState] = useState(EMPTY);
  const [status, setStatus] = useState("loading"); // loading | authenticated | anonymous
  // The session resolves before the profile does (see loadContext). Role-gated
  // routes must wait for this, or they'd redirect on a not-yet-loaded role.
  const [profileLoaded, setProfileLoaded] = useState(false);
  // What the user is doing *right now*, as opposed to what they may do. The
  // server owns it; this is a cache so the shell can pick a tab set without a
  // round trip on every render.
  const [mode, setModeState] = useState("idle");
  const loadingRef = useRef(false);

  /** Load the profile + driver + settings rows for a signed-in user. */
  const loadContext = useCallback(async (session) => {
    const userId = session?.user?.id ?? null;
    currentUserId = userId;

    if (!userId) {
      setState(EMPTY);
      setStatus("anonymous");
      setProfileLoaded(true);
      return;
    }
    setProfileLoaded(false);

    // Resolve the session first. The profile rows are supporting detail — if
    // that fetch is slow or fails, the app should still render (signed in, with
    // a name that fills in a moment later) rather than sit on a splash screen
    // forever on a flaky connection.
    setState((prev) => ({ ...prev, session, user: session.user }));
    setStatus("authenticated");

    // Fetch in parallel — none of them depend on each other.
    const [{ data: profile }, { data: driver }, { data: settings }] = await Promise.all([
      supabase.from("users").select("*").eq("id", userId).maybeSingle(),
      supabase.from("drivers").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    // A sign-out (or a switch to another account) can land while we were
    // waiting; don't overwrite the newer state with stale rows.
    if (currentUserId !== userId) return;

    // A brand-new account may not have a settings row yet (the migration
    // backfills existing users; the trigger only creates the profile).
    let resolvedSettings = settings;
    if (!resolvedSettings) {
      const { data } = await supabase
        .from("user_settings")
        .upsert({ user_id: userId }, { onConflict: "user_id" })
        .select()
        .maybeSingle();
      resolvedSettings = data ?? null;
      if (currentUserId !== userId) return;
    }

    setState({
      session,
      user: session.user,
      profile: profile ?? null,
      driver: driver ?? null,
      settings: resolvedSettings,
    });
    setProfileLoaded(true);
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      await loadContext(session);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      // TOKEN_REFRESHED fires often and carries no new profile data.
      if (event === "TOKEN_REFRESHED" && currentUserId === session?.user?.id) {
        setState((prev) => ({ ...prev, session, user: session?.user ?? null }));
        return;
      }
      if (loadingRef.current) return;
      loadingRef.current = true;
      loadContext(session).finally(() => {
        loadingRef.current = false;
      });
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [loadContext]);

  /** Re-read the profile/driver/settings rows (after an edit, or a verification change). */
  const refresh = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    await loadContext(session);
  }, [loadContext]);

  const updateProfile = useCallback(async (patch) => {
    if (!currentUserId) return { error: new Error("Not signed in") };
    const { data, error } = await supabase
      .from("users")
      .update(patch)
      .eq("id", currentUserId)
      .select()
      .maybeSingle();
    if (!error && data) setState((prev) => ({ ...prev, profile: data }));
    return { data, error };
  }, []);

  const updateSettings = useCallback(async (patch) => {
    if (!currentUserId) return { error: new Error("Not signed in") };
    const { data, error } = await supabase
      .from("user_settings")
      .upsert({ user_id: currentUserId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select()
      .maybeSingle();
    if (!error && data) setState((prev) => ({ ...prev, settings: data }));
    return { data, error };
  }, []);

  const signOut = useCallback(async () => {
    // Drop off duty first so we don't leave a phantom online driver behind.
    if (currentUserId) {
      await supabase.rpc("set_driver_duty", { p_online: false }).catch(() => {});
    }
    await supabase.auth.signOut();
    currentUserId = null;
    setState(EMPTY);
    setStatus("anonymous");
    setProfileLoaded(true);
  }, []);

  // Load the server's view of the mode once the session is known, and again
  // whenever the driver record changes (approval flips what is even possible).
  useEffect(() => {
    if (status !== "authenticated") {
      setModeState("idle");
      return;
    }
    let active = true;
    (async () => {
      const { data } = await currentMode();
      if (active && typeof data === "string") setModeState(data);
    })();
    return () => {
      active = false;
    };
  }, [status, state.driver?.verification_status]);

  /**
   * Switch between riding and driving.
   *
   * Returns `{ error }` rather than throwing, because the server refuses this
   * for good reasons the user needs to read — you cannot go on duty while you
   * are sitting in someone else's back seat.
   */
  const setMode = useCallback(async (next, dest = null) => {
    const { data, error } = await setUserMode(next, dest);
    if (error) return { error };
    setModeState(data?.mode ?? next);
    return { error: null };
  }, []);

  const value = useMemo(() => {
    const { session, user, profile, driver, settings } = state;
    return {
      status,
      loading: status === "loading",
      // True once the profile/driver/settings rows have been fetched. Anything
      // that branches on a *role* must wait for this, not just `loading`.
      profileLoaded,
      isAuthenticated: status === "authenticated",
      session,
      user,
      userId: user?.id ?? null,
      profile,
      driver,
      settings,
      isDriver: Boolean(profile?.is_driver),
      isApprovedDriver: driver?.verification_status === "approved",
      mode,
      isDriving: DRIVING_MODES.includes(mode),
      setMode,
      isAdmin: Boolean(profile?.is_admin),
      displayName: profile?.name || "Rider",
      refresh,
      updateProfile,
      updateSettings,
      signOut,
    };
  }, [state, status, profileLoaded, mode, setMode, refresh, updateProfile, updateSettings, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

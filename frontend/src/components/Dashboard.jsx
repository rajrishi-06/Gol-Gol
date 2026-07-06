import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Phone,
  Calendar,
  Star,
  LogOut,
  Navigation,
  ChevronRight,
  Clock,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { formatDate, formatTime, formatCurrency, formatDistance } from "../lib/format";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import RightPanel from "./RightPanel";
import Navbar from "./Navbar";
import Avatar from "./ui/Avatar";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Card from "./ui/Card";
import Skeleton from "./ui/Skeleton";

// ── helpers ──────────────────────────────────────────────────────────────────

function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="inline-flex items-center gap-2.5 text-sm text-muted">
        <Icon className="h-4 w-4 text-subtle" />
        {label}
      </span>
      <span className="text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <Card className="mt-6 p-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="mt-6 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </Card>
  );
}

function HistorySkeleton() {
  return (
    <div className="mt-4 space-y-3">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── ride history card ─────────────────────────────────────────────────────────

function RideHistoryCard({ ride }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>{formatDate(ride.created_at)} · {formatTime(ride.created_at)}</span>
          </div>
          <div className="mt-2 space-y-1">
            <p className="flex items-start gap-1.5 text-sm">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="line-clamp-1 text-foreground">
                {ride.from_address || `${ride.from_lat?.toFixed(4)}, ${ride.from_lng?.toFixed(4)}`}
              </span>
            </p>
            <p className="flex items-start gap-1.5 text-sm">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
              <span className="line-clamp-1 text-muted">
                {ride.to_address || `${ride.to_lat?.toFixed(4)}, ${ride.to_lng?.toFixed(4)}`}
              </span>
            </p>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-muted">
            <span>{formatDistance(ride.distance_km)}</span>
            <span>·</span>
            <span className="capitalize">{ride.vehicle_type}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-semibold text-foreground">{formatCurrency(ride.fare)}</p>
          <Badge tone="success" className="mt-1">Completed</Badge>
        </div>
      </div>
    </Card>
  );
}

// ── main component ────────────────────────────────────────────────────────────

const TABS = ["Profile", "Past Rides"];

export default function Dashboard({ setLogIn }) {
  useDocumentTitle("Dashboard");
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Profile");

  // profile
  const [userData, setUserData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);

  // ride history
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [historyFetched, setHistoryFetched] = useState(false);

  // ── fetch profile ──────────────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    const uuid = localStorage.getItem("user_uuid");
    if (!uuid) { navigate("/"); return; }
    setProfileLoading(true);
    setProfileError(false);
    const { data, error } = await supabase.from("users").select("*").eq("id", uuid).single();
    if (error || !data) { setProfileError(true); } else { setUserData(data); }
    setProfileLoading(false);
  }, [navigate]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // ── fetch ride history (lazy — only when tab opened) ──────────────────────
  const fetchHistory = useCallback(async () => {
    const uuid = localStorage.getItem("user_uuid");
    if (!uuid) return;
    setHistoryLoading(true);
    setHistoryError(false);
    const { data, error } = await supabase
      .from("rides")
      .select("id, from_lat, from_lng, to_lat, to_lng, from_address, to_address, distance_km, fare, vehicle_type, created_at")
      .eq("rider_id", uuid)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) { setHistoryError(true); } else { setHistory(data || []); }
    setHistoryLoading(false);
    setHistoryFetched(true);
  }, []);

  // Fetch history when the tab is first opened
  useEffect(() => {
    if (activeTab === "Past Rides" && !historyFetched) fetchHistory();
  }, [activeTab, historyFetched, fetchHistory]);

  // ── logout ────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setLogIn(false);
      localStorage.removeItem("user_uuid");
      navigate("/");
    }
  };

  const rating = Math.max(0, Math.min(5, Math.round(Number(userData?.user_rating) || 0)));

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden sm:flex-row">
      <div className="flex w-full flex-col overflow-y-auto bg-background px-6 pb-8 sm:w-[500px] sm:shrink-0 sm:border-r sm:border-border lg:w-[540px]">
        <Navbar logIn />

        <div className="animate-fade-up pt-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Your account</h1>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" /> Log out
            </Button>
          </div>

          {/* Tabs */}
          <div role="tablist" className="mt-5 flex border-b border-border">
            {TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={
                  "pb-2.5 pr-6 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  (activeTab === tab
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted hover:text-foreground")
                }
              >
                {tab}
              </button>
            ))}
          </div>

          {/* ── Profile tab ──────────────────────────────────────────────── */}
          {activeTab === "Profile" && (
            <>
              {profileLoading ? (
                <ProfileSkeleton />
              ) : profileError ? (
                <Card className="mt-6 p-6 text-center">
                  <p className="text-sm text-muted">We couldn&apos;t load your profile.</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 inline-flex items-center gap-1.5"
                    onClick={fetchProfile}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Try again
                  </Button>
                </Card>
              ) : userData ? (
                <>
                  <Card className="mt-6 overflow-hidden">
                    <div className="flex items-center gap-4 border-b border-border bg-gradient-to-br from-primary-subtle/60 to-transparent p-6">
                      <Avatar name={userData.name} size="lg" />
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold text-foreground">{userData.name}</h2>
                        <p className="truncate text-sm text-muted">{userData.email || "No email added"}</p>
                        <div className="mt-1.5">
                          <Badge tone={userData.is_driver ? "success" : "neutral"} dot>
                            {userData.is_driver ? "Verified driver" : "Rider"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="divide-y divide-border px-6">
                      <DetailRow icon={Phone} label="Mobile">{userData.mobile}</DetailRow>
                      <DetailRow icon={Calendar} label="Member since">{formatDate(userData.created_at)}</DetailRow>
                      <DetailRow icon={Star} label="Rating">
                        <span className="inline-flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={
                                "h-4 w-4 " +
                                (i < rating ? "fill-warning text-warning" : "text-border-strong")
                              }
                            />
                          ))}
                        </span>
                      </DetailRow>
                    </div>
                  </Card>

                  {!userData.is_driver && (
                    <Card
                      as="button"
                      interactive
                      onClick={() => navigate("/driver/activate")}
                      className="mt-4 flex w-full items-center gap-4 p-4 text-left"
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary-subtle-fg">
                        <Navigation className="h-5 w-5" />
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-foreground">Drive with Gol·Gol</span>
                        <span className="block text-xs text-muted">Turn your commute into earnings</span>
                      </span>
                      <ChevronRight className="h-5 w-5 text-subtle" />
                    </Card>
                  )}
                </>
              ) : null}
            </>
          )}

          {/* ── Past Rides tab ───────────────────────────────────────────── */}
          {activeTab === "Past Rides" && (
            <>
              {historyLoading ? (
                <HistorySkeleton />
              ) : historyError ? (
                <Card className="mt-6 p-6 text-center">
                  <p className="text-sm text-muted">Couldn&apos;t load your trips.</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 inline-flex items-center gap-1.5"
                    onClick={() => { setHistoryFetched(false); fetchHistory(); }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Try again
                  </Button>
                </Card>
              ) : history.length === 0 ? (
                <Card className="mt-6 p-8 text-center">
                  <Clock className="mx-auto h-8 w-8 text-subtle" />
                  <p className="mt-3 text-sm font-medium text-foreground">No trips yet</p>
                  <p className="mt-1 text-xs text-muted">Your completed rides will appear here.</p>
                  <Button size="sm" className="mt-4" onClick={() => navigate("/")}>
                    Book a ride
                  </Button>
                </Card>
              ) : (
                <div className="mt-4 space-y-3">
                  {history.map((ride) => (
                    <RideHistoryCard key={ride.id} ride={ride} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <p className="mt-auto pt-8 text-center text-xs text-subtle">
          © {new Date().getFullYear()} Gol·Gol — All rights reserved
        </p>
      </div>

      <RightPanel />
    </div>
  );
}

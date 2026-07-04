import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, Calendar, Star, LogOut, Navigation, ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/format";
import RightPanel from "./RightPanel";
import Navbar from "./Navbar";
import Avatar from "./ui/Avatar";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Card from "./ui/Card";
import Skeleton from "./ui/Skeleton";

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

export default function Dashboard({ setLogIn }) {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uuid = localStorage.getItem("user_uuid");
    if (!uuid) {
      navigate("/");
      return;
    }
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("users").select("*").eq("id", uuid).single();
      setUserData(data);
      setLoading(false);
    })();
  }, [navigate]);

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
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Your account</h1>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" /> Log out
            </Button>
          </div>

          {loading ? (
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
                  <DetailRow icon={Phone} label="Mobile">
                    {userData.mobile}
                  </DetailRow>
                  <DetailRow icon={Calendar} label="Member since">
                    {formatDate(userData.created_at)}
                  </DetailRow>
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
          ) : (
            <Card className="mt-6 p-6 text-center text-sm text-muted">
              We couldn&apos;t load your profile. Please try again.
            </Card>
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

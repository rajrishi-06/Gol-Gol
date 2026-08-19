import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Phone,
  Calendar,
  LogOut,
  Navigation,
  ChevronRight,
  Pencil,
  Check,
  X,
  ShieldCheck,
  Route as RouteIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth.jsx";
import { formatDate } from "../lib/format";
import { SECONDARY_LINKS, ADMIN_LINK } from "../components/layout/navItems";
import Page from "../components/layout/Page";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Avatar from "../components/ui/Avatar";
import Skeleton from "../components/ui/Skeleton";
import StarRating from "../components/ui/StarRating";
import Field, { Input } from "../components/ui/Field";

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="flex-1 rounded-xl bg-surface-2 p-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-subtle" />
      <p className="mt-1.5 text-lg font-bold leading-none text-foreground">{value}</p>
      <p className="mt-1 text-[0.68rem] text-muted">{label}</p>
    </div>
  );
}

function LinkRow({ to, label, icon: Icon, hint }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
    </Link>
  );
}

const HINTS = {
  "/account/places": "Home, work and your favourites",
  "/account/safety": "Emergency contacts and SOS",
  "/account/settings": "Notifications, theme, language",
  "/help": "FAQs and getting in touch",
};

/**
 * Account home. Replaces the old read-only Dashboard: the profile is editable,
 * the rating is real (it comes from actual trip feedback now), and every other
 * account surface is one tap away instead of not existing.
 */
export default function Account() {
  const { profile, driver, isApprovedDriver, isAdmin, loading, updateProfile, signOut } = useAuth();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) setForm({ name: profile.name ?? "", email: profile.email ?? "" });
  }, [profile]);

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Please enter your name.");
      return;
    }
    setSaving(true);
    const { error } = await updateProfile({
      name: form.name.trim(),
      email: form.email.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't save your profile.");
      return;
    }
    toast.success("Profile updated");
    setEditing(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const driverStatus = driver?.verification_status;

  return (
    <Page
      title="Account"
      actions={
        <Button variant="ghost" size="sm" aria-label="Log out" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Log out</span>
        </Button>
      }
    >
      {loading || !profile ? (
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-44" />
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Profile */}
          <Card className="overflow-hidden">
            <div className="flex items-start gap-4 border-b border-border bg-gradient-to-br from-primary-subtle/60 to-transparent p-5">
              <Avatar name={profile.name} size="lg" />
              <div className="min-w-0 flex-1">
                {editing ? (
                  <div className="space-y-2.5">
                    <Field label="Name" required htmlFor="acct-name">
                      {(a) => (
                        <Input
                          {...a}
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          maxLength={80}
                        />
                      )}
                    </Field>
                    <Field label="Email" hint="For receipts and trip updates." htmlFor="acct-email">
                      {(a) => (
                        <Input
                          {...a}
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        />
                      )}
                    </Field>
                    <div className="flex gap-2">
                      <Button size="sm" loading={saving} onClick={save}>
                        <Check className="h-3.5 w-3.5" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                        <X className="h-3.5 w-3.5" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="truncate text-lg font-semibold text-foreground">{profile.name}</h2>
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        aria-label="Edit profile"
                        className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="truncate text-sm text-muted">{profile.email || "No email added"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone={isApprovedDriver ? "success" : "neutral"} dot>
                        {isApprovedDriver ? "Verified driver" : "Rider"}
                      </Badge>
                      {isAdmin && <Badge tone="brand">Admin</Badge>}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-2 p-4">
              <Stat label="Trips" value={profile.total_rides ?? 0} icon={RouteIcon} />
              <div className="flex-1 rounded-xl bg-surface-2 p-3 text-center">
                <StarRating value={profile.user_rating} size="sm" className="justify-center" />
                <p className="mt-1.5 text-lg font-bold leading-none text-foreground">
                  {Number(profile.user_rating ?? 5).toFixed(1)}
                </p>
                <p className="mt-1 text-[0.68rem] text-muted">
                  {profile.rating_count ? `${profile.rating_count} ratings` : "No ratings yet"}
                </p>
              </div>
              <Stat label="Mobile" value={profile.mobile || "—"} icon={Phone} />
            </div>

            <div className="border-t border-border px-4 py-3">
              <p className="flex items-center gap-2 text-xs text-muted">
                <Calendar className="h-3.5 w-3.5" />
                Member since {formatDate(profile.created_at)}
              </p>
            </div>
          </Card>

          {/* Driving */}
          {isApprovedDriver ? (
            <Card
              as="button"
              interactive
              onClick={() => navigate("/driver/dashboard")}
              className="flex w-full items-center gap-4 p-4 text-left"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary-subtle-fg">
                <Navigation className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">Switch to driving</span>
                <span className="block text-xs text-muted">Go online and take ride requests</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-subtle" />
            </Card>
          ) : (
            <Card
              as="button"
              interactive
              onClick={() => navigate("/driver/activate")}
              className="flex w-full items-center gap-4 p-4 text-left"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary-subtle-fg">
                <Navigation className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  {driverStatus === "pending"
                    ? "Driver application in review"
                    : driverStatus === "rejected"
                    ? "Driver application needs attention"
                    : "Drive with Gol·Gol"}
                </span>
                <span className="block text-xs text-muted">
                  {driverStatus === "pending"
                    ? "We're checking your documents"
                    : driverStatus === "rejected"
                    ? "Review your details and reapply"
                    : "Turn your commute into earnings"}
                </span>
              </span>
              {driverStatus && (
                <Badge tone={driverStatus === "rejected" ? "danger" : "warning"}>{driverStatus}</Badge>
              )}
              <ChevronRight className="h-5 w-5 shrink-0 text-subtle" />
            </Card>
          )}

          {/* Everything else */}
          <Card className="divide-y divide-border overflow-hidden">
            {SECONDARY_LINKS.map((link) => (
              <LinkRow key={link.to} {...link} hint={HINTS[link.to]} />
            ))}
            {isAdmin && <LinkRow {...ADMIN_LINK} hint="Approve or reject driver applications" />}
          </Card>

          <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-subtle">
            <ShieldCheck className="h-3.5 w-3.5" />© {new Date().getFullYear()} Gol·Gol
          </p>
        </div>
      )}
    </Page>
  );
}

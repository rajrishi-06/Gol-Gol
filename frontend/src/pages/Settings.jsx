import { useEffect, useState } from "react";
import { Bell, BellOff, Moon, Sun, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth.jsx";
import { disablePush, enablePush, pushPermission, pushSupported } from "../lib/push";
import { getInitialTheme, setTheme } from "../lib/theme";
import Page from "../components/layout/Page";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Switch from "../components/ui/Switch";
import { mySafetyPrefs, setSafetyPrefs } from "../lib/pooling";
import Alert from "../components/ui/Alert";
import { Select } from "../components/ui/Field";
import { cn } from "../lib/cn";

const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी (Hindi)" },
  { id: "te", label: "తెలుగు (Telugu)" },
];

function Section({ title, description, children }) {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}

/**
 * Preferences that actually do something: which notifications you get, whether
 * turn-by-turn speaks, theme and language. Previously the only setting in the
 * app was the theme toggle in the navbar.
 */
export default function Settings() {
  const [prefs, setPrefs] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await mySafetyPrefs();
      if (active) setPrefs(data);
    })();
    return () => {
      active = false;
    };
  }, []);

  const savePref = async (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    const { error } = await setSafetyPrefs({
      gender: next.gender ?? null,
      womenOnlyDefault: next.women_only_default ?? false,
    });
    if (error) toast.error("Couldn't save that.");
  };

  const { settings, updateSettings, userId } = useAuth();
  const [theme, setThemeState] = useState(getInitialTheme);
  const [perm, setPerm] = useState(() => pushPermission());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setThemeState(document.documentElement.getAttribute("data-theme") || getInitialTheme());
  }, []);

  const toggle = async (key, value) => {
    const { error } = await updateSettings({ [key]: value });
    if (error) toast.error("Couldn't save that preference.");
  };

  const chooseTheme = (next) => {
    setTheme(next);
    setThemeState(next);
  };

  const handlePush = async () => {
    setBusy(true);
    if (perm === "granted") {
      await disablePush();
      setPerm(pushPermission());
      toast.success("Push notifications turned off on this device.");
    } else {
      const res = await enablePush(userId);
      setPerm(pushPermission());
      if (!res.ok) {
        toast.error(
          res.reason === "denied"
            ? "Notifications are blocked in your browser settings."
            : "Push isn't available on this device."
        );
      } else {
        toast.success("Push notifications on — we'll ping you even with the tab closed.");
      }
    }
    setBusy(false);
  };

  return (
    <Page title="Settings" subtitle="Notifications, appearance and language" back>
      <div className="space-y-4">
        <Section title="Notifications" description="Choose what we tell you about.">
          {!pushSupported() ? (
            <Alert tone="info">
              This browser doesn&apos;t support background notifications. In-app alerts still work.
            </Alert>
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-2 p-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">Push on this device</span>
                <span className="block text-xs text-muted">
                  {perm === "granted"
                    ? "You'll get alerts even when the tab is closed"
                    : perm === "denied"
                    ? "Blocked in your browser settings"
                    : "Get ride updates with the app closed"}
                </span>
              </span>
              <Button
                size="sm"
                variant={perm === "granted" ? "secondary" : "primary"}
                loading={busy}
                disabled={perm === "denied"}
                onClick={handlePush}
              >
                {perm === "granted" ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                {perm === "granted" ? "Turn off" : "Enable"}
              </Button>
            </div>
          )}

          <Switch
            label="Ride updates"
            description="Driver assigned, arrived, trip started and completed"
            checked={settings?.notify_ride ?? true}
            onChange={(v) => toggle("notify_ride", v)}
          />
          <Switch
            label="Chat messages"
            description="New messages from your driver or rider"
            checked={settings?.notify_chat ?? true}
            onChange={(v) => toggle("notify_chat", v)}
          />
          <Switch
            label="Offers and news"
            description="Occasional promos — off by default"
            checked={settings?.notify_promos ?? false}
            onChange={(v) => toggle("notify_promos", v)}
          />
        </Section>

        <Section title="Driving" description="Applies when you're navigating a trip.">
          <Switch
            label="Voice guidance"
            description="Speak the next turn while navigating"
            checked={settings?.voice_guidance ?? true}
            onChange={(v) => toggle("voice_guidance", v)}
          />
          <Switch
            label="Share trip by default"
            description="Create a live-tracking link automatically when a ride starts"
            checked={settings?.share_trip_default ?? false}
            onChange={(v) => toggle("share_trip_default", v)}
          />
        </Section>

        <Section
          title="Sharing"
          description="Only used to decide who you share a vehicle with. Never shown to your driver or anyone you ride with."
        >
          <fieldset>
            <legend className="text-sm font-medium text-foreground">Gender</legend>
            <p className="mt-0.5 text-xs text-muted">
              Optional. Leave it unset if you&apos;d rather not say — everything works
              the same either way.
            </p>
            <div role="radiogroup" aria-label="Gender" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { id: null, label: "Not set" },
                { id: "female", label: "Woman" },
                { id: "male", label: "Man" },
                { id: "other", label: "Other" },
              ].map((o) => {
                const active = (prefs?.gender ?? null) === o.id;
                return (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => savePref({ gender: o.id })}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-primary bg-primary-subtle text-primary-subtle-fg"
                        : "border-border bg-surface text-muted hover:text-foreground"
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {prefs?.gender === "female" && (
            <Switch
              label="Share with women only"
              description="Default for new bookings. You can change it per ride."
              checked={prefs?.women_only_default ?? false}
              onChange={(v) => savePref({ women_only_default: v })}
            />
          )}
        </Section>

        <Section title="Appearance">
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2">
            {[
              { id: "light", label: "Light", icon: Sun },
              { id: "dark", label: "Dark", icon: Moon },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={theme === id}
                onClick={() => chooseTheme(id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border p-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  theme === id
                    ? "border-primary bg-primary-subtle text-primary-subtle-fg"
                    : "border-border bg-surface text-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Language" description="Interface language for this account.">
          <Select
            value={settings?.language ?? "en"}
            onChange={(e) => toggle("language", e.target.value)}
            aria-label="Language"
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-subtle">
            Hindi and Telugu translations are in progress — the preference is saved to your account
            and will apply as strings land.
          </p>
        </Section>

        <Section title="Device" description="Only affects this browser.">
          <div className="flex items-center justify-between gap-4">
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Smartphone className="h-4 w-4 text-subtle" /> Clear cached trip draft
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                Forget the pickup, drop and ride type you last selected
              </span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                sessionStorage.removeItem("golgol:booking");
                toast.success("Trip draft cleared");
              }}
            >
              <Trash2 className="h-4 w-4" /> Clear
            </Button>
          </div>
        </Section>
      </div>
    </Page>
  );
}

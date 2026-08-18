import { useCallback, useEffect, useState } from "react";
import { Plus, PhoneCall, Trash2, ShieldCheck, Siren, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth.jsx";
import {
  EMERGENCY_NUMBERS,
  addEmergencyContact,
  deleteEmergencyContact,
  listEmergencyContacts,
  updateEmergencyContact,
} from "../lib/safety";
import { supabase } from "../lib/supabase";
import { formatDate, formatTime } from "../lib/format";
import Page from "../components/layout/Page";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Switch from "../components/ui/Switch";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import Modal from "../components/ui/Modal";
import Field, { Input } from "../components/ui/Field";

/**
 * Safety centre: who we alert, the numbers to call, and a log of any SOS you've
 * raised. None of this existed — a rider had no in-app way to get help.
 */
export default function Safety() {
  const { userId, settings, updateSettings } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", mobile: "", relation: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rows }, { data: sos }] = await Promise.all([
      listEmergencyContacts(userId),
      supabase
        .from("sos_alerts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    setContacts(rows);
    setAlerts(sos ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const mobile = form.mobile.replace(/\D/g, "");
    if (!form.name.trim()) return toast.error("Please enter a name.");
    if (mobile.length < 10) return toast.error("Please enter a valid 10-digit mobile number.");

    setSaving(true);
    const { error } = await addEmergencyContact({
      userId,
      name: form.name.trim(),
      mobile,
      relation: form.relation.trim() || null,
      notifyOnRide: true,
    });
    setSaving(false);
    if (error) return toast.error("Couldn't add this contact.");
    toast.success("Contact added");
    setAdding(false);
    setForm({ name: "", mobile: "", relation: "" });
    load();
  };

  const remove = async (contact) => {
    const { error } = await deleteEmergencyContact(contact.id);
    if (error) return toast.error("Couldn't remove this contact.");
    setContacts((prev) => prev.filter((c) => c.id !== contact.id));
    toast.success(`${contact.name} removed`);
  };

  const toggleNotify = async (contact, value) => {
    setContacts((prev) => prev.map((c) => (c.id === contact.id ? { ...c, notify_on_ride: value } : c)));
    const { error } = await updateEmergencyContact(contact.id, { notify_on_ride: value });
    if (error) {
      toast.error("Couldn't update this contact.");
      load();
    }
  };

  return (
    <Page title="Safety" subtitle="Emergency contacts, helplines and alerts" back>
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary-subtle-fg">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">How safety works here</h2>
              <p className="mt-1 text-sm text-muted">
                Every trip has a live share link, an SOS button and OTP-verified boarding. Your
                driver is document-verified before they can accept a single ride.
              </p>
            </div>
          </div>
          <Switch
            className="mt-4 border-t border-border pt-4"
            label="Auto-share every trip"
            description="Create a live-tracking link as soon as a ride starts"
            checked={settings?.share_trip_default ?? false}
            onChange={(v) => updateSettings({ share_trip_default: v })}
          />
        </Card>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Emergency contacts</h2>
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No contacts yet"
              description="Add someone who should know if you raise an alert during a trip."
              action={<Button onClick={() => setAdding(true)}>Add a contact</Button>}
            />
          ) : (
            <Card className="divide-y divide-border overflow-hidden">
              {contacts.map((c) => (
                <div key={c.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{c.name}</span>
                      <span className="block text-xs text-muted">
                        {c.mobile}
                        {c.relation && ` · ${c.relation}`}
                      </span>
                    </span>
                    <a
                      href={`tel:${c.mobile}`}
                      aria-label={`Call ${c.name}`}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <PhoneCall className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      aria-label={`Remove ${c.name}`}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger-subtle hover:text-danger-fg focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <Switch
                    className="mt-3"
                    label="Notify on alerts"
                    checked={c.notify_on_ride}
                    onChange={(v) => toggleNotify(c, v)}
                  />
                </div>
              ))}
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Helplines</h2>
          <div className="grid grid-cols-2 gap-2">
            {EMERGENCY_NUMBERS.map(({ label, number }) => (
              <a
                key={number}
                href={`tel:${number}`}
                className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface p-3.5 shadow-soft transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-danger-subtle text-danger-fg">
                  <PhoneCall className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{label}</span>
                  <span className="block text-xs text-muted">{number}</span>
                </span>
              </a>
            ))}
          </div>
        </section>

        {alerts.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-foreground">Alert history</h2>
            <Card className="divide-y divide-border overflow-hidden">
              {alerts.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-danger-subtle text-danger-fg">
                    <Siren className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-foreground">SOS raised</span>
                    <span className="block text-xs text-muted">
                      {formatDate(a.created_at)} · {formatTime(a.created_at)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-subtle">
                    {a.resolved ? "Resolved" : "Recorded"}
                  </span>
                </div>
              ))}
            </Card>
          </section>
        )}
      </div>

      <Modal
        open={adding}
        onClose={saving ? undefined : () => setAdding(false)}
        title="Add an emergency contact"
        description="They'll be notified if you raise an SOS during a trip."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setAdding(false)} disabled={saving}>
              Cancel
            </Button>
            <Button fullWidth loading={saving} onClick={save}>
              Add contact
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Name" required htmlFor="ec-name">
            {(a) => (
              <Input
                {...a}
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                maxLength={60}
              />
            )}
          </Field>
          <Field label="Mobile" required htmlFor="ec-mobile">
            {(a) => (
              <Input
                {...a}
                type="tel"
                inputMode="numeric"
                value={form.mobile}
                onChange={(e) =>
                  setForm((f) => ({ ...f, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) }))
                }
                placeholder="98765 43210"
              />
            )}
          </Field>
          <Field label="Relationship" hint="Optional — Partner, Parent, Friend…" htmlFor="ec-rel">
            {(a) => (
              <Input
                {...a}
                value={form.relation}
                onChange={(e) => setForm((f) => ({ ...f, relation: e.target.value }))}
                maxLength={40}
              />
            )}
          </Field>
        </div>
      </Modal>
    </Page>
  );
}

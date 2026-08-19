import { useCallback, useEffect, useState } from "react";
import { Home, Briefcase, MapPin, Plus, Trash2, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth.jsx";
import { deleteSavedPlace, listSavedPlaces, upsertSavedPlace } from "../lib/places";
import Page from "../components/layout/Page";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import Modal from "../components/ui/Modal";
import Field, { Input } from "../components/ui/Field";
import PlaceSearch from "../components/PlaceSearch";

const KIND_ICON = { home: Home, work: Briefcase, custom: MapPin };

function PlaceRow({ place, onDelete }) {
  const Icon = KIND_ICON[place.kind] ?? MapPin;
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary-subtle-fg">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{place.label}</span>
        <span className="block truncate text-xs text-muted">{place.address}</span>
      </span>
      <button
        type="button"
        onClick={() => onDelete(place)}
        aria-label={`Remove ${place.label}`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger-subtle hover:text-danger-fg focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Saved places — the shortcut that turns "where to?" into one tap. Home and
 * Work are singletons (upserted by kind); everything else is free-form.
 */
export default function SavedPlaces() {
  const { userId } = useAuth();
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { kind, label }
  const [picked, setPicked] = useState(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await listSavedPlaces(userId);
    setPlaces(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (kind) => {
    setEditing({ kind });
    setPicked(null);
    setLabel(kind === "home" ? "Home" : kind === "work" ? "Work" : "");
  };

  const save = async () => {
    if (!picked) {
      toast.error("Pick a location first.");
      return;
    }
    setSaving(true);
    const { error } = await upsertSavedPlace({
      userId,
      kind: editing.kind,
      label: label.trim() || undefined,
      address: picked.address,
      lat: picked.lat,
      lng: picked.lng,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't save this place.");
      return;
    }
    toast.success("Place saved");
    setEditing(null);
    load();
  };

  const remove = async (place) => {
    const { error } = await deleteSavedPlace(place.id);
    if (error) {
      toast.error("Couldn't remove this place.");
      return;
    }
    setPlaces((prev) => prev.filter((p) => p.id !== place.id));
    toast.success(`${place.label} removed`);
  };

  const home = places.find((p) => p.kind === "home");
  const work = places.find((p) => p.kind === "work");
  const others = places.filter((p) => p.kind === "custom");

  return (
    <Page
      title="Saved places"
      subtitle="Book to your regular spots in one tap"
      back
      actions={
        <Button size="sm" aria-label="Add a place" onClick={() => openEditor("custom")}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add</span>
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="divide-y divide-border overflow-hidden">
            {home ? (
              <PlaceRow place={home} onDelete={remove} />
            ) : (
              <button
                type="button"
                onClick={() => openEditor("home")}
                className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-subtle">
                  <Home className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">Add home</span>
                  <span className="block text-xs text-muted">Your most common destination</span>
                </span>
                <Plus className="h-4 w-4 shrink-0 text-subtle" />
              </button>
            )}

            {work ? (
              <PlaceRow place={work} onDelete={remove} />
            ) : (
              <button
                type="button"
                onClick={() => openEditor("work")}
                className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-subtle">
                  <Briefcase className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">Add work</span>
                  <span className="block text-xs text-muted">For the daily commute</span>
                </span>
                <Plus className="h-4 w-4 shrink-0 text-subtle" />
              </button>
            )}
          </Card>

          {others.length > 0 ? (
            <Card className="divide-y divide-border overflow-hidden">
              {others.map((p) => (
                <PlaceRow key={p.id} place={p} onDelete={remove} />
              ))}
            </Card>
          ) : (
            <EmptyState
              icon={Bookmark}
              title="No other saved places"
              description="Save the gym, a friend's flat, the airport — anywhere you go often."
              action={<Button onClick={() => openEditor("custom")}>Add a place</Button>}
            />
          )}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={saving ? undefined : () => setEditing(null)}
        title={
          editing?.kind === "home" ? "Set home" : editing?.kind === "work" ? "Set work" : "Add a place"
        }
        description="Search for the address, then give it a name."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button fullWidth loading={saving} disabled={!picked} onClick={save}>
              Save place
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <PlaceSearch autoFocus onSelect={setPicked} placeholder="Search address or landmark" />

          {picked && (
            <div className="flex items-start gap-2.5 rounded-xl bg-surface-2 p-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="min-w-0 text-sm text-foreground">{picked.address}</p>
            </div>
          )}

          {editing?.kind === "custom" && (
            <Field label="Name" hint="Gym, Mum's place, Airport…" htmlFor="place-label">
              {(a) => (
                <Input
                  {...a}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Saved place"
                  maxLength={40}
                />
              )}
            </Field>
          )}
        </div>
      </Modal>
    </Page>
  );
}

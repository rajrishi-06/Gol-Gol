import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ShieldCheck, ExternalLink, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth.jsx";
import {
  DRIVER_VEHICLE_TYPES,
  SERVICE_CLASSES_FOR,
  RIDE_TYPE_MAP,
} from "../../lib/vehicles";
import { formatDate } from "../../lib/format";
import Logo from "../ui/Logo";
import Button from "../ui/Button";
import Field, { Input, Select } from "../ui/Field";
import Alert from "../ui/Alert";
import Badge from "../ui/Badge";
import Skeleton from "../ui/Skeleton";

const panel =
  "flex h-full w-full flex-col overflow-y-auto bg-background px-6 pb-8 sm:w-[460px] sm:shrink-0 sm:border-r sm:border-border lg:w-[500px]";

const GUIDELINES = [
  "Make sure your documents are valid and clearly legible.",
  "Keep your vehicle roadworthy and clean.",
  "Track every trip and your payouts from the driver dashboard.",
  "Reach out to support if anything looks wrong.",
];

const EMPTY_FORM = {
  licenseNumber: "",
  licenseExpiry: "",
  vehicleRegistration: "",
  vehicleType: "",
  vehicleClass: "",
  vehicleMake: "",
  vehicleModel: "",
  vehicleColor: "",
  documentUrl: "",
};

/**
 * Driver onboarding.
 *
 * The important addition is **service class**. `vehicle_type` describes the
 * body (car, bike, auto…) while riders book a class (Mini, Sedan, SUV…), and
 * dispatch used to compare the two directly — so a driver who registered a
 * "car" was invisible to every Mini, Sedan and SUV request ever made. The form
 * now captures the class explicitly, constrained to what the body type can
 * plausibly serve.
 */
export default function DriverLeftPanel() {
  const navigate = useNavigate();
  const { userId, profile, driver, refresh, loading: authLoading } = useAuth();

  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Prefill from an existing application (a rejected driver is re-applying).
  useEffect(() => {
    if (!driver) return;
    setForm({
      licenseNumber: driver.license_number || "",
      licenseExpiry: driver.license_expiry || "",
      vehicleRegistration: driver.vehicle_registration || "",
      vehicleType: driver.vehicle_type || "",
      vehicleClass: driver.vehicle_class || "",
      vehicleMake: driver.vehicle_make || "",
      vehicleModel: driver.vehicle_model || "",
      vehicleColor: driver.vehicle_color || "",
      documentUrl: driver.document_url || "",
    });
  }, [driver]);

  // An approved driver has nothing to do here.
  useEffect(() => {
    if (driver?.verification_status === "approved") navigate("/driver/dashboard", { replace: true });
  }, [driver, navigate]);

  const classOptions = SERVICE_CLASSES_FOR(form.vehicleType);

  // Keep the class valid when the body type changes.
  useEffect(() => {
    if (form.vehicleClass && !classOptions.includes(form.vehicleClass)) {
      setForm((f) => ({ ...f, vehicleClass: classOptions[0] ?? "" }));
    }
  }, [form.vehicleClass, classOptions]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);

    if (
      !form.licenseNumber ||
      !form.licenseExpiry ||
      !form.vehicleRegistration ||
      !form.vehicleType ||
      !form.vehicleClass ||
      !form.documentUrl
    ) {
      return setError("Please fill in every required field, including the document link.");
    }
    if (new Date(form.licenseExpiry) < new Date()) {
      return setError("That licence has already expired. Renew it before applying.");
    }
    try {
      new URL(form.documentUrl);
    } catch {
      return setError("Please enter a valid, viewable document URL.");
    }

    setSubmitting(true);
    try {
      const details = {
        user_id: userId,
        license_number: form.licenseNumber.trim(),
        license_expiry: form.licenseExpiry,
        vehicle_registration: form.vehicleRegistration.trim().toUpperCase(),
        vehicle_type: form.vehicleType,
        vehicle_class: form.vehicleClass,
        vehicle_make: form.vehicleMake.trim() || null,
        vehicle_model: form.vehicleModel.trim() || null,
        vehicle_color: form.vehicleColor.trim() || null,
        document_url: form.documentUrl.trim(),
        // A DB trigger owns this field — a driver can't approve themselves.
        verification_status: "pending",
      };

      const { error: upsertError } = await supabase
        .from("drivers")
        .upsert(details, { onConflict: "user_id" });
      if (upsertError) throw upsertError;

      if (!profile?.is_driver) {
        const { error: flagError } = await supabase
          .from("users")
          .update({ is_driver: true })
          .eq("id", userId);
        if (flagError) throw flagError;
      }

      await refresh();
      toast.success("Application submitted — we'll review it shortly.");
    } catch (err) {
      setError(`Submission failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const Header = () => (
    <header className="flex items-center justify-between py-4">
      <Logo />
      <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
        <ShieldCheck className="h-3.5 w-3.5" /> Driver onboarding
      </span>
    </header>
  );

  if (authLoading) {
    return (
      <div className={panel}>
        <Header />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    );
  }

  const status = driver?.verification_status;

  // ── under review ──────────────────────────────────────────────────────────
  if (status === "pending") {
    return (
      <div className={panel}>
        <Header />
        <div className="animate-fade-up">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-warning-subtle text-warning-fg">
            <Clock className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            Verification in progress
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Thanks for applying. Our team is reviewing your documents — this usually takes one to two
            business days, and we&apos;ll notify you the moment it&apos;s decided.
          </p>

          <div className="mt-5 rounded-2xl border border-border bg-surface p-4 shadow-soft">
            <h2 className="text-sm font-semibold text-foreground">Your application</h2>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-subtle">Vehicle</dt>
                <dd className="text-right font-medium text-foreground">
                  {[driver.vehicle_color, driver.vehicle_make, driver.vehicle_model]
                    .filter(Boolean)
                    .join(" ") || driver.vehicle_type}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-subtle">Service class</dt>
                <dd className="text-right font-medium text-foreground">
                  {RIDE_TYPE_MAP[driver.vehicle_class]?.name ?? driver.vehicle_class}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-subtle">Registration</dt>
                <dd className="text-right font-medium text-foreground">
                  {driver.vehicle_registration}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-subtle">Applied</dt>
                <dd className="text-right font-medium text-foreground">
                  {formatDate(driver.created_at)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-soft">
            <h2 className="text-sm font-semibold text-foreground">Driver guidelines</h2>
            <ul className="mt-3 space-y-2">
              {GUIDELINES.map((g) => (
                <li key={g} className="flex items-start gap-2 text-sm text-muted">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // ── apply / reapply ───────────────────────────────────────────────────────
  const isReapplying = status === "rejected";

  return (
    <div className={panel}>
      <Header />
      <div className="animate-fade-up">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {isReapplying ? "Reapply as a driver" : "Drive with Gol·Gol"}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Upload your licence and vehicle documents to a cloud drive and paste the shareable link
          below. You can go online as soon as we approve them.
        </p>

        {isReapplying && (
          <Alert tone="warning" title="Action required" className="mt-4">
            {driver?.rejection_reason ||
              "Your previous application wasn't approved. Review your details and resubmit."}
          </Alert>
        )}
        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        )}

        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="Licence number" required htmlFor="license">
            {(a) => (
              <Input
                {...a}
                value={form.licenseNumber}
                onChange={set("licenseNumber")}
                placeholder="DL-0420110149646"
              />
            )}
          </Field>
          <Field label="Licence expiry" required htmlFor="expiry">
            {(a) => (
              <Input {...a} type="date" value={form.licenseExpiry} onChange={set("licenseExpiry")} />
            )}
          </Field>
          <Field label="Vehicle registration" required htmlFor="reg">
            {(a) => (
              <Input
                {...a}
                value={form.vehicleRegistration}
                onChange={set("vehicleRegistration")}
                placeholder="TS 09 AB 3456"
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Vehicle type" required htmlFor="vtype">
              {(a) => (
                <Select {...a} value={form.vehicleType} onChange={set("vehicleType")}>
                  <option value="">Select</option>
                  {DRIVER_VEHICLE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="Service class"
              required
              hint="Which rides you'll receive"
              htmlFor="vclass"
            >
              {(a) => (
                <Select
                  {...a}
                  value={form.vehicleClass}
                  onChange={set("vehicleClass")}
                  disabled={!form.vehicleType}
                >
                  <option value="">Select</option>
                  {classOptions.map((c) => (
                    <option key={c} value={c}>
                      {RIDE_TYPE_MAP[c]?.name ?? c}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Make" htmlFor="vmake">
              {(a) => <Input {...a} value={form.vehicleMake} onChange={set("vehicleMake")} placeholder="Maruti" />}
            </Field>
            <Field label="Model" htmlFor="vmodel">
              {(a) => <Input {...a} value={form.vehicleModel} onChange={set("vehicleModel")} placeholder="Swift" />}
            </Field>
            <Field label="Colour" htmlFor="vcolor">
              {(a) => <Input {...a} value={form.vehicleColor} onChange={set("vehicleColor")} placeholder="White" />}
            </Field>
          </div>

          <Field
            label="Document link"
            required
            hint="Google Drive, Dropbox, etc. — make sure it's viewable by anyone with the link."
            htmlFor="doc"
          >
            {(a) => (
              <Input
                {...a}
                type="url"
                value={form.documentUrl}
                onChange={set("documentUrl")}
                placeholder="https://drive.google.com/…"
              />
            )}
          </Field>

          {driver?.document_url && (
            <a
              href={driver.document_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> View current document
            </a>
          )}

          <div className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
            <Badge tone="brand" className="mb-1.5">
              Why we ask
            </Badge>
            Riders see verified drivers only. We check your licence and registration before you can
            accept a single ride — it&apos;s the main reason people trust the app.
          </div>

          <Button type="submit" fullWidth size="lg" loading={submitting}>
            {isReapplying ? "Resubmit application" : "Submit application"}
          </Button>
        </form>
      </div>
    </div>
  );
}

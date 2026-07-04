import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ShieldCheck, ExternalLink } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { DRIVER_VEHICLE_TYPES } from "../../lib/vehicles";
import Logo from "../ui/Logo";
import Button from "../ui/Button";
import Field, { Input, Select } from "../ui/Field";
import Alert from "../ui/Alert";
import Skeleton from "../ui/Skeleton";

const panel =
  "flex h-[100dvh] w-full flex-col overflow-y-auto bg-background px-6 pb-8 sm:w-[500px] sm:shrink-0 sm:border-r sm:border-border lg:w-[540px]";

const GUIDELINES = [
  "Ensure your documents are valid and legible.",
  "Keep your vehicle in good working condition.",
  "Track all your trips from the driver dashboard.",
  "Reach out to support if you face any issues.",
];

export default function DriverLeftPanel() {
  const [userData, setUserData] = useState(null);
  const [driverData, setDriverData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    licenseNumber: "",
    licenseExpiry: "",
    vehicleRegistration: "",
    vehicleType: "",
    documentUrl: "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const userUuid = localStorage.getItem("user_uuid");
        if (!userUuid) {
          setError("Please sign in to continue.");
          setLoading(false);
          return;
        }
        const { data: user, error: userError } = await supabase
          .from("users")
          .select("is_driver")
          .eq("id", userUuid)
          .single();
        if (userError) throw userError;
        setUserData(user);

        if (user?.is_driver) {
          const { data: driver, error: driverError } = await supabase
            .from("drivers")
            .select("verification_status, license_number, license_expiry, vehicle_registration, vehicle_type, document_url")
            .eq("user_id", userUuid)
            .single();
          if (driverError && driverError.code !== "PGRST116") throw driverError;
          setDriverData(driver);

          if (driver?.verification_status === "approved") navigate("/driver/dashboard");
          else if (driver?.verification_status === "rejected") {
            setForm({
              licenseNumber: driver.license_number || "",
              licenseExpiry: driver.license_expiry || "",
              vehicleRegistration: driver.vehicle_registration || "",
              vehicleType: driver.vehicle_type || "",
              documentUrl: driver.document_url || "",
            });
          }
        }
      } catch {
        setError("Failed to load your data. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!form.licenseNumber || !form.licenseExpiry || !form.vehicleRegistration || !form.vehicleType || !form.documentUrl) {
      return setError("Please fill in all fields, including the document link.");
    }
    if (!DRIVER_VEHICLE_TYPES.includes(form.vehicleType)) return setError("Please select a valid vehicle type.");
    try {
      new URL(form.documentUrl);
    } catch {
      return setError("Please enter a valid document URL.");
    }

    setSubmitting(true);
    try {
      const userUuid = localStorage.getItem("user_uuid");
      const details = {
        user_id: userUuid,
        license_number: form.licenseNumber,
        license_expiry: form.licenseExpiry,
        vehicle_registration: form.vehicleRegistration,
        vehicle_type: form.vehicleType,
        document_url: form.documentUrl,
        verification_status: "pending",
      };

      const { data: existing, error: existingError } = await supabase
        .from("drivers")
        .select("user_id")
        .eq("user_id", userUuid)
        .single();
      if (existingError && existingError.code !== "PGRST116") throw existingError;

      if (existing) {
        const { error: updateError } = await supabase.from("drivers").update(details).eq("user_id", userUuid);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from("drivers").insert([details]);
        if (insertError) throw insertError;
        const { error: flagError } = await supabase.from("users").update({ is_driver: true }).eq("id", userUuid);
        if (flagError) throw new Error("Profile created, but we couldn't mark you as a driver. Contact support.");
      }

      setMessage("Application submitted. Verification is pending.");
      const { data: updatedUser } = await supabase.from("users").select("is_driver").eq("id", userUuid).single();
      setUserData(updatedUser);
      const { data: updatedDriver } = await supabase
        .from("drivers")
        .select("verification_status, license_number, license_expiry, vehicle_registration, vehicle_type, document_url")
        .eq("user_id", userUuid)
        .single();
      setDriverData(updatedDriver);
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

  if (loading) {
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

  const showForm =
    (userData && !userData.is_driver) || (driverData && driverData.verification_status === "rejected");
  const isReapplying = driverData?.verification_status === "rejected";

  if (showForm) {
    return (
      <div className={panel}>
        <Header />
        <div className="animate-fade-up">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isReapplying ? "Reapply as a driver" : "Become a driver"}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Upload your license &amp; vehicle documents to a cloud drive and paste the shareable link below.
          </p>

          {isReapplying && (
            <Alert tone="warning" title="Action required" className="mt-4">
              Your previous application wasn&apos;t approved. Review your details and resubmit.
            </Alert>
          )}
          {message && <Alert tone="success" className="mt-4">{message}</Alert>}
          {error && <Alert tone="danger" className="mt-4">{error}</Alert>}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <Field label="License number" required htmlFor="license">
              {(a) => <Input {...a} value={form.licenseNumber} onChange={set("licenseNumber")} placeholder="DL-0420110149646" />}
            </Field>
            <Field label="License expiry" required htmlFor="expiry">
              {(a) => <Input {...a} type="date" value={form.licenseExpiry} onChange={set("licenseExpiry")} />}
            </Field>
            <Field label="Vehicle registration" required htmlFor="reg">
              {(a) => <Input {...a} value={form.vehicleRegistration} onChange={set("vehicleRegistration")} placeholder="MH 12 AB 3456" />}
            </Field>
            <Field label="Vehicle type" required htmlFor="vtype">
              {(a) => (
                <Select {...a} value={form.vehicleType} onChange={set("vehicleType")}>
                  <option value="">Select a type</option>
                  {DRIVER_VEHICLE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="Document link"
              required
              hint="Google Drive, Dropbox, etc. — make sure it's viewable."
              htmlFor="doc"
            >
              {(a) => <Input {...a} type="url" value={form.documentUrl} onChange={set("documentUrl")} placeholder="https://drive.google.com/…" />}
            </Field>
            {driverData?.document_url && (
              <a
                href={driverData.document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> View current document
              </a>
            )}
            <Button type="submit" fullWidth size="lg" loading={submitting}>
              {isReapplying ? "Resubmit application" : "Submit application"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (userData?.is_driver && driverData?.verification_status === "pending") {
    return (
      <div className={panel}>
        <Header />
        <div className="animate-fade-up">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-warning-subtle text-warning-fg">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">Verification in progress</h1>
          <p className="mt-1.5 text-sm text-muted">
            Thanks for applying! Our team is reviewing your documents — this usually takes 1–2 business days.
          </p>
          <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-soft">
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

  return (
    <div className={panel}>
      <Header />
      <div className="animate-fade-up">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Driver guidelines</h1>
        <ul className="mt-4 space-y-2">
          {GUIDELINES.map((g) => (
            <li key={g} className="flex items-start gap-2 text-sm text-muted">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {g}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

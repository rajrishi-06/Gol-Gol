import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";
import RightPanel from "./RightPanel";
import Logo from "./ui/Logo";
import Button from "./ui/Button";
import Field, { Input } from "./ui/Field";
import OtpInput from "./ui/OtpInput";

export default function Login({ setLogIn }) {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const navigate = useNavigate();

  const phoneIsValid = phone.length === 10;
  const otpIsValid = otp.length === 6;

  // Resend cooldown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendOtp = async (options) => {
    const { error } = await supabase.auth.signInWithOtp({ phone: `+91${phone}`, ...options });
    if (error) throw error;
    setResendIn(30);
  };

  const handlePhoneSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      // maybeSingle → no 406 when the number isn't registered yet.
      const { data: existing } = await supabase.from("users").select("id").eq("mobile", phone).maybeSingle();
      if (existing) {
        setIsNewUser(false);
        await sendOtp();
        setStep(3);
      } else {
        setIsNewUser(true);
        setStep(2);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegistrationContinue = async () => {
    if (!name.trim()) return setError("Please enter your name.");
    setError("");
    setLoading(true);
    try {
      await sendOtp({ options: { data: { name, email } } });
      setStep(3);
    } catch (err) {
      setError("Failed to send OTP: " + (err.message || "unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.verifyOtp({ phone: `+91${phone}`, token: otp, type: "sms" });
      if (error || !session) throw error || new Error("no session");
      setLogIn?.(true);
      navigate("/");
    } catch {
      setError("That code didn't match. Please try again.");
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    setError("");
    try {
      await sendOtp(isNewUser ? { options: { data: { name, email } } } : undefined);
    } catch {
      setError("Couldn't resend the code. Try again shortly.");
    }
  };

  const handleBack = () => {
    setError("");
    if (step === 1) return window.history.back();
    if (step === 3 && isNewUser) return setStep(2);
    setStep(1);
  };

  const submitOnEnter = (fn, enabled) => (e) => {
    if (e.key === "Enter" && enabled) fn();
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden sm:flex-row">
      <div className="flex w-full flex-col overflow-y-auto bg-background px-6 py-6 sm:w-[500px] sm:shrink-0 sm:border-r sm:border-border lg:w-[540px]">
        <header className="flex items-center justify-between">
          <button
            onClick={handleBack}
            aria-label="Go back"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Logo />
          <span className="w-10" />
        </header>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
          {/* Step indicator */}
          <div className="mb-8 flex items-center gap-2" aria-hidden="true">
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={
                  "h-1.5 flex-1 rounded-full transition-colors duration-300 " +
                  (s <= step ? "bg-primary" : "bg-surface-3")
                }
              />
            ))}
          </div>

          {step === 1 && (
            <div className="animate-fade-up space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Enter your mobile number
                </h1>
                <p className="mt-1.5 text-sm text-muted">
                  We&apos;ll text you a 6-digit code to sign in securely.
                </p>
              </div>
              <Field label="Mobile number" error={error} htmlFor="phone">
                {({ id, ...aria }) => (
                  <div className="flex items-stretch overflow-hidden rounded-xl border border-border-strong bg-surface focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
                    <span className="flex items-center border-r border-border px-3.5 text-sm font-medium text-muted">
                      +91
                    </span>
                    <input
                      id={id}
                      {...aria}
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      autoFocus
                      maxLength={10}
                      placeholder="98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      onKeyDown={submitOnEnter(handlePhoneSubmit, phoneIsValid)}
                      className="flex-1 bg-transparent px-3.5 py-3 text-sm text-foreground placeholder:text-subtle focus:outline-none"
                    />
                  </div>
                )}
              </Field>
              <Button fullWidth size="lg" disabled={!phoneIsValid} loading={loading} onClick={handlePhoneSubmit}>
                Continue
              </Button>
            </div>
          )}

          {step === 2 && isNewUser && (
            <div className="animate-fade-up space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Create your account
                </h1>
                <p className="mt-1.5 text-sm text-muted">Just a couple of details to get you moving.</p>
              </div>
              <div className="space-y-4">
                <Field label="Full name" required error={error} htmlFor="name">
                  {({ id, ...aria }) => (
                    <Input
                      id={id}
                      {...aria}
                      autoFocus
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Email" hint="Optional — for receipts and updates." htmlFor="email">
                  {({ id, ...aria }) => (
                    <Input
                      id={id}
                      {...aria}
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  )}
                </Field>
              </div>
              <Button fullWidth size="lg" loading={loading} onClick={handleRegistrationContinue}>
                Send code
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="animate-fade-up space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Verify your number
                </h1>
                <p className="mt-1.5 text-sm text-muted">
                  Enter the code sent to <span className="font-medium text-foreground">+91 {phone}</span>
                </p>
              </div>
              <div className="space-y-2">
                <OtpInput value={otp} onChange={setOtp} invalid={Boolean(error)} disabled={loading} />
                {error && (
                  <p role="alert" className="text-xs font-medium text-danger-fg">
                    {error}
                  </p>
                )}
              </div>
              <Button fullWidth size="lg" disabled={!otpIsValid} loading={loading} onClick={handleVerify}>
                Verify &amp; continue
              </Button>
              <p className="text-center text-sm text-muted">
                Didn&apos;t get it?{" "}
                <button
                  onClick={handleResend}
                  disabled={resendIn > 0}
                  className="font-medium text-primary hover:underline disabled:text-subtle disabled:no-underline"
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              </p>
            </div>
          )}

          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-subtle">
            <ShieldCheck className="h-3.5 w-3.5" />
            Protected by end-to-end encrypted OTP
          </p>
        </div>
      </div>

      <RightPanel />
    </div>
  );
}

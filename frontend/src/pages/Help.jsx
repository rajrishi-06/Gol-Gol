import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Mail, MessageSquare, ShieldCheck, Wallet, Car, Navigation } from "lucide-react";
import { cn } from "../lib/cn";
import Page from "../components/layout/Page";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

const TOPICS = [
  { to: "/activity", label: "Trips & receipts", icon: Car, hint: "Find a past trip or its receipt" },
  { to: "/wallet", label: "Payments", icon: Wallet, hint: "Payment methods and outstanding amounts" },
  { to: "/account/safety", label: "Safety", icon: ShieldCheck, hint: "Emergency contacts and SOS" },
  { to: "/driver/activate", label: "Driving", icon: Navigation, hint: "Sign up and get verified" },
];

const FAQS = [
  {
    q: "How is my fare calculated?",
    a: "Every ride class has a base fare plus a per-kilometre rate. The distance and the fare are computed on our servers when you book — the app can't change them — so the price you're shown is the price that's charged. Waiting time beyond three minutes is billed at ₹2/minute, and any peak-pricing multiplier is shown separately on the receipt.",
  },
  {
    q: "What is the start OTP for?",
    a: "It proves the right rider got into the right car. The code is generated on our servers and only ever shown to you; the driver types it in to start the trip and never gets to read it. If a driver asks you to start without the OTP, don't.",
  },
  {
    q: "Can I cancel? Is there a fee?",
    a: "You can cancel any time before the trip starts. There's no fee if no driver has accepted yet, or if you cancel within two minutes of a driver accepting. After that a ₹30 fee applies, because your driver has already started travelling to you.",
  },
  {
    q: "How do I share my trip with someone?",
    a: "Tap the shield icon on the live ride screen and choose 'Share live trip'. That creates a link showing your route, status and the driver's live position — and nothing else. It expires after six hours, and you can revoke it at any time.",
  },
  {
    q: "How do driver ratings work?",
    a: "After every completed trip both people rate each other from one to five stars. Those ratings are averaged into the profile rating you see. Ratings are only ever visible as an average, never attributed to an individual trip.",
  },
  {
    q: "I want to drive. What do I need?",
    a: "A valid driving licence, your vehicle's registration, and a shareable link to photos of both. Submit them from 'Drive with Gol·Gol' and our team reviews them — usually within one to two business days. You can only go online once you're approved.",
  },
  {
    q: "What happens if I lose connection mid-trip?",
    a: "The app tells you: a banner appears when live updates stop, and everything re-syncs the moment you're back. Your trip carries on regardless — the record of it lives on our servers, not on your phone.",
  },
  {
    q: "How do I delete my account?",
    a: "Email support@gol-gol.app from your registered address and we'll remove your account and personal data. Completed trip records are retained where we're legally required to keep them.",
  },
];

function Faq({ q, a, open, onToggle, id }) {
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`faq-${id}`}
        onClick={onToggle}
        className="flex w-full items-center gap-3 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{q}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-subtle transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      <div id={`faq-${id}`} hidden={!open} className="pb-4">
        <p className="text-sm leading-relaxed text-muted">{a}</p>
      </div>
    </div>
  );
}

/** Help centre: jump-off points, FAQs and a way to actually reach a human. */
export default function Help() {
  const [open, setOpen] = useState(null);

  return (
    <Page title="Help & support" subtitle="Answers, and how to reach us" back>
      <div className="space-y-4">
        <div className="grid gap-2 min-[420px]:grid-cols-2">
          {TOPICS.map(({ to, label, icon: Icon, hint }) => (
            <Link
              key={to}
              to={to}
              className="flex items-start gap-2.5 rounded-2xl border border-border bg-surface p-3.5 shadow-soft transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary-subtle-fg">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </Link>
          ))}
        </div>

        <Card className="px-4">
          <h2 className="pt-4 text-sm font-semibold text-foreground">Frequently asked</h2>
          <div className="mt-1">
            {FAQS.map((f, i) => (
              <Faq
                key={f.q}
                id={i}
                {...f}
                open={open === i}
                onToggle={() => setOpen(open === i ? null : i)}
              />
            ))}
          </div>
        </Card>

        <Card className="p-5 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary-subtle text-primary-subtle-fg">
            <MessageSquare className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-base font-semibold text-foreground">Still stuck?</h2>
          <p className="mt-1 text-sm text-muted">
            Tell us your trip date and what went wrong — we&apos;ll come back within a day.
          </p>
          <Button as="a" href="mailto:support@gol-gol.app" className="mt-4">
            <Mail className="h-4 w-4" /> Email support
          </Button>
        </Card>
      </div>
    </Page>
  );
}

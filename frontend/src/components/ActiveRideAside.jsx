import { useNavigate } from "react-router-dom";
import { MapPin, ArrowRight, Navigation } from "lucide-react";
import { formatCurrency } from "../lib/format";
import { RIDE_TYPE_MAP } from "../lib/vehicles";
import Button from "./ui/Button";

function statusLabel(status, role) {
  if (status === "ongoing") return "Trip in progress";
  return role === "driver" ? "Heading to pickup" : "Driver on the way";
}

/**
 * Full-height home aside that surfaces the user's active ride (instead of the
 * idle globe) with live status and a one-tap return to the live map.
 */
export default function ActiveRideAside({ ride, role }) {
  const navigate = useNavigate();
  const ret = () => navigate(role === "driver" ? `/driver/ride/${ride.id}` : `/rider/ride/${ride.id}`);
  const vehicle = RIDE_TYPE_MAP[ride.vehicle_type];

  return (
    <aside
      className="relative hidden flex-1 overflow-hidden sm:block"
      style={{ background: "radial-gradient(120% 120% at 70% 10%, #0f7a63 0%, #0b5c4b 45%, #083b31 100%)" }}
    >
      <div className="bg-grid absolute inset-0 opacity-[0.06]" aria-hidden="true" />
      <div className="absolute -left-24 top-1/3 h-72 w-72 animate-float rounded-full bg-brand-500/25 blur-3xl" aria-hidden="true" />

      <div className="relative z-10 flex h-full flex-col justify-center p-10 xl:p-14">
        <div className="animate-fade-up w-full max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/85">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-300 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-300" />
            </span>
            Live · {statusLabel(ride.status, role)}
          </span>

          <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-white">
            You have a ride in progress.
          </h2>

          <div className="glass mt-6 rounded-3xl border border-white/15 p-5 shadow-floating">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-white">
                {vehicle?.icon && (
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-white">
                    <img src={vehicle.icon} alt="" className="h-6 w-6 object-contain" />
                  </span>
                )}
                {vehicle?.name || "Your ride"}
              </span>
              <span className="text-sm font-semibold text-white">{formatCurrency(ride.fare)}</span>
            </div>

            <div className="relative mt-4 pl-6">
              <span aria-hidden className="absolute left-[5px] top-2 h-[calc(100%-1rem)] w-px border-l border-dashed border-white/30" />
              <div className="relative pb-3">
                <span className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full bg-brand-300 ring-4 ring-white/10" />
                <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-white/50">From</p>
                <p className="truncate text-sm text-white/90">{ride.from_address || "Pickup"}</p>
              </div>
              <div className="relative">
                <span className="absolute -left-6 top-1 grid h-2.5 w-2.5 place-items-center text-danger">
                  <MapPin className="h-3 w-3" />
                </span>
                <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-white/50">To</p>
                <p className="truncate text-sm text-white/90">{ride.to_address || "Destination"}</p>
              </div>
            </div>
          </div>

          <Button onClick={ret} size="lg" className="mt-6 bg-white text-brand-800 shadow-floating hover:bg-white/90">
            <Navigation className="h-4 w-4" />
            {role === "driver" ? "Resume navigation" : "Return to live map"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}

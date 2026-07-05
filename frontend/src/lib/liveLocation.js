import { supabase } from "./supabase";

/**
 * Live ride location over Supabase Realtime **Broadcast** — an ephemeral pub/sub
 * channel, so high-frequency GPS updates don't hammer Postgres (the previous
 * design wrote a row on every tick). The database is still used for the
 * last-known position (a throttled write), so a rider opening the screen sees
 * the driver immediately before the next broadcast arrives.
 *
 * The channel is keyed by the ride UUID, which only the rider and driver know.
 * For production, promote this to an RLS-authorized private channel.
 */
const channelName = (rideId) => `ride-location:${rideId}`;

/** Driver side: join the ride channel and return a `send(loc)` + `cleanup()`. */
export function publishRideLocation(rideId) {
  const channel = supabase.channel(channelName(rideId), {
    config: { broadcast: { self: false } },
  });
  channel.subscribe();
  return {
    send: (loc) => channel.send({ type: "broadcast", event: "loc", payload: loc }),
    cleanup: () => supabase.removeChannel(channel),
  };
}

/** Rider side: subscribe to the driver's live position. Returns an unsubscribe fn. */
export function subscribeRideLocation(rideId, onLocation) {
  const channel = supabase
    .channel(channelName(rideId), { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "loc" }, ({ payload }) => {
      if (payload && Number.isFinite(payload.lat) && Number.isFinite(payload.lng)) {
        onLocation({ lat: payload.lat, lng: payload.lng });
      }
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

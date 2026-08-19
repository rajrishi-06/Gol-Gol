import { supabase } from "./supabase";

/**
 * Live ride location over Supabase Realtime **Broadcast** — an ephemeral pub/sub
 * channel, so high-frequency GPS updates don't hammer Postgres (the original
 * design wrote a row on every tick). The database still holds the last-known
 * position via a throttled write, so a rider opening the screen sees the driver
 * immediately, before the next broadcast arrives.
 *
 * The channel is keyed by the ride UUID, which only the rider and driver know.
 * For a hardened deployment, promote this to an RLS-authorized private channel.
 */
const channelName = (rideId) => `ride-location:${rideId}`;

/** Driver side: join the ride channel and return `send(loc)` + `cleanup()`. */
export function publishRideLocation(rideId) {
  let subscribed = false;
  let pending = null;

  const channel = supabase.channel(channelName(rideId), {
    config: { broadcast: { self: false } },
  });

  const push = (loc) => channel.send({ type: "broadcast", event: "loc", payload: loc });

  channel.subscribe((status) => {
    if (status !== "SUBSCRIBED") {
      subscribed = false;
      return;
    }
    subscribed = true;
    // Flush the most recent fix taken while the socket was still connecting.
    if (pending) {
      push(pending);
      pending = null;
    }
  });

  return {
    // Before the channel is joined, `send` silently falls back to an HTTP
    // request per call — on a GPS stream that's a request every second or two.
    // Hold the latest fix instead and flush it on subscribe.
    send: (loc) => {
      if (!subscribed) {
        pending = loc;
        return;
      }
      push(loc);
    },
    cleanup: () => {
      pending = null;
      supabase.removeChannel(channel);
    },
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

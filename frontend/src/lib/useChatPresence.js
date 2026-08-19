import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

const TYPING_TIMEOUT_MS = 2500;

/**
 * Who's here, and are they typing?
 *
 * Uses Realtime Presence rather than a database table — this is ephemeral
 * state that nobody should be paying to store, and presence disappears on its
 * own when a tab closes. Gives the ride chat the two signals that make waiting
 * bearable: "they're looking at this" and "they're replying".
 */
export function useChatPresence(rideId, userId) {
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const channelRef = useRef(null);
  const typingUntil = useRef(0);
  const selfTyping = useRef(false);

  useEffect(() => {
    if (!rideId || !userId) return undefined;

    const channel = supabase.channel(`ride-presence:${rideId}`, {
      config: { presence: { key: userId } },
    });

    const readState = () => {
      const state = channel.presenceState();
      const others = Object.entries(state).filter(([key]) => key !== userId);
      setPeerOnline(others.length > 0);
      setPeerTyping(others.some(([, metas]) => metas.some((m) => m.typing)));
    };

    channel
      .on("presence", { event: "sync" }, readState)
      .on("presence", { event: "join" }, readState)
      .on("presence", { event: "leave" }, readState)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ typing: false, at: Date.now() });
        }
      });

    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [rideId, userId]);

  // Stop advertising "typing" a couple of seconds after the last keystroke.
  useEffect(() => {
    const timer = setInterval(() => {
      if (selfTyping.current && Date.now() > typingUntil.current) {
        selfTyping.current = false;
        channelRef.current?.track({ typing: false, at: Date.now() });
      }
    }, 800);
    return () => clearInterval(timer);
  }, []);

  /** Call on every keystroke; the hook throttles the actual presence update. */
  const setTyping = useCallback(() => {
    typingUntil.current = Date.now() + TYPING_TIMEOUT_MS;
    if (selfTyping.current) return;
    selfTyping.current = true;
    channelRef.current?.track({ typing: true, at: Date.now() });
  }, []);

  const clearTyping = useCallback(() => {
    typingUntil.current = 0;
    if (!selfTyping.current) return;
    selfTyping.current = false;
    channelRef.current?.track({ typing: false, at: Date.now() });
  }, []);

  return { peerOnline, peerTyping, setTyping, clearTyping };
}

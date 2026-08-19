import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { supabase } from "../lib/supabase";
import { notifyUser } from "../lib/notify";
import { useChatPresence } from "../lib/useChatPresence";
import { formatTime } from "../lib/format";
import { cn } from "../lib/cn";

const QUICK_REPLIES = ["I'm outside", "2 minutes away", "On my way", "Can you wait?"];

/** Three animated dots — the universal "they're replying" signal. */
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-current"
          style={{ animationDelay: `${i * 120}ms`, animationDuration: "1s" }}
        />
      ))}
    </span>
  );
}

/**
 * In-ride chat.
 *
 * Adds the two things that make a chat feel alive — a presence dot and a
 * typing indicator, both over ephemeral Realtime Presence rather than extra
 * database writes — plus quick replies, because a driver at the wheel should
 * not be typing.
 */
export default function Chatbox({
  rideId,
  userId,
  messages,
  title = "Chat",
  recipientId,
  recipientUrl,
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const { peerOnline, peerTyping, setTyping, clearTyping } = useChatPresence(rideId, userId);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, peerTyping]);

  const send = async (text) => {
    const body = (text ?? draft).trim();
    if (!body || !userId || sending) return;
    setSending(true);
    setDraft("");
    clearTyping();

    const { error } = await supabase
      .from("chat_messages")
      .insert({ ride_id: rideId, sender_id: userId, message: body });
    setSending(false);
    if (error) {
      // Put the text back rather than losing what they wrote.
      setDraft(body);
      return;
    }
    // Only push a notification if they're not already looking at the thread.
    if (recipientId && !peerOnline) {
      notifyUser({
        userId: recipientId,
        title: "New message",
        body,
        url: recipientUrl,
        type: "chat",
      });
    }
  };

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface shadow-soft">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
          {peerTyping ? (
            <>
              <TypingDots />
              typing…
            </>
          ) : peerOnline ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
              Online
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-subtle" aria-hidden="true" />
              Offline
            </>
          )}
        </span>
      </div>

      <div className="flex h-56 flex-col gap-1.5 overflow-y-auto p-3" role="log" aria-label={title}>
        {messages.length === 0 && (
          <p className="m-auto text-xs text-subtle">No messages yet — say hello</p>
        )}
        {messages.map((msg) => {
          const mine = msg.sender_id === userId;
          return (
            <div key={msg.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
              <p
                className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                  mine
                    ? "rounded-br-sm bg-primary text-primary-fg"
                    : "rounded-bl-sm bg-surface-2 text-foreground"
                )}
              >
                {msg.message}
              </p>
              <span className="mt-0.5 px-1 text-[0.62rem] text-subtle">
                {formatTime(msg.created_at)}
              </span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Quick replies — safe to tap while driving. */}
      <div className="flex gap-1.5 overflow-x-auto border-t border-border px-2 py-2">
        {QUICK_REPLIES.map((reply) => (
          <button
            key={reply}
            type="button"
            onClick={() => send(reply)}
            disabled={sending}
            className="shrink-0 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {reply}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-center gap-2 border-t border-border p-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value) setTyping();
            else clearTyping();
          }}
          onBlur={clearTyping}
          placeholder="Type a message…"
          aria-label="Message"
          maxLength={500}
          className="flex-1 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send message"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

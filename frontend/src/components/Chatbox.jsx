import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/cn";

/** Shared in-ride chat. Previously duplicated in both ride components. */
export default function Chatbox({ rideId, userId, messages, title = "Chat" }) {
  const [newMessage, setNewMessage] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = newMessage.trim();
    if (!text || !userId) return;
    setNewMessage("");
    await supabase.from("chat_messages").insert({ ride_id: rideId, sender_id: userId, message: text });
  };

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface shadow-soft">
      <div className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">{title}</div>
      <div className="flex h-56 flex-col gap-1.5 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="m-auto text-xs text-subtle">No messages yet — say hello 👋</p>
        )}
        {messages.map((msg) => {
          const mine = msg.sender_id === userId;
          return (
            <div key={msg.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
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
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border p-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message…"
          aria-label="Message"
          className="flex-1 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          aria-label="Send message"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-fg transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

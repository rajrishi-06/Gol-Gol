import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

const ChatBox = ({ fromId, toId }) => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    socket.emit("join-room", fromId);

    const handleReceive = (data) => {
      if (data.from === toId) {
        setMessages((prev) => [...prev, { ...data, type: "received" }]);
      }
    };

    socket.on("receive-message", handleReceive);

    return () => {
      socket.off("receive-message", handleReceive);
    };
  }, [toId, fromId]);

  const sendMessage = () => {
    if (!message.trim()) return;

    const msgObj = { from: fromId, to: toId, text: message };
    socket.emit("send-message", msgObj);
    setMessages((prev) => [...prev, { ...msgObj, type: "sent" }]);
    setMessage("");
  };

  return (
    <div className="mt-6 rounded-xl border border-gray-300 shadow-lg bg-white w-full max-w-md mx-auto">
      <div className="bg-blue-600 text-white px-4 py-2 rounded-t-xl font-semibold text-lg">
        🗨️ Live Chat & Location Updates
      </div>

      <div className="p-4 h-[250px] overflow-y-auto space-y-2 bg-gray-50">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[80%] p-2 rounded-lg text-sm ${
              msg.type === "sent"
                ? "ml-auto bg-blue-100 text-right"
                : "mr-auto bg-gray-200 text-left"
            }`}
          >
            {msg.text}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 p-3 border-t bg-white rounded-b-xl">
        <input
          type="text"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring focus:ring-blue-400"
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendMessage();
          }}
        />
        <button
          onClick={sendMessage}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatBox;

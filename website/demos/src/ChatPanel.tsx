import { useEffect, useRef } from "react";
import type { ChatMessage } from "./types";

export function ChatPanel({ messages }: { messages: ChatMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <aside className="chat">
      <header className="chat-head">
        <span className="status-dot" /> Agent session
      </header>
      <div className="chat-body">
        {messages.map((m) => (
          <Message key={m.id} m={m} />
        ))}
        <div ref={endRef} />
      </div>
    </aside>
  );
}

function Message({ m }: { m: ChatMessage }) {
  switch (m.role) {
    case "user":
      return (
        <div className="msg msg-user">
          <span className="who">You</span>
          <p>{m.text}</p>
        </div>
      );
    case "agent":
      return (
        <div className="msg msg-agent">
          <span className="who">Agent</span>
          <p>{m.text}</p>
        </div>
      );
    case "tool":
      return (
        <div className={`tool tool-${m.status}`}>
          <span className="tool-icon">{m.status === "done" ? "✓" : "▟"}</span>
          <code>
            <span className="tool-name">{m.name}</span>
            {m.arg ? <span className="tool-arg">({m.arg})</span> : "()"}
          </code>
        </div>
      );
    case "code":
      return (
        <div className="code">
          <div className="code-label">{m.label}</div>
          <pre>
            {m.lines.map((l, i) => (
              <div key={i} className={l.kind ? `ln ln-${l.kind}` : "ln"}>
                <span className="gutter">{l.kind === "del" ? "-" : l.kind === "add" ? "+" : " "}</span>
                {l.text}
              </div>
            ))}
          </pre>
        </div>
      );
  }
}

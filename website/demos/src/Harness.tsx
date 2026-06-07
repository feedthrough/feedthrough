import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { ButtonOverflow } from "./demos/ButtonOverflow";
import { ListBug, type ListHandle } from "./demos/ListBug";
import { Occlusion, type OcclusionHandle } from "./demos/Occlusion";
import { ChatController, play, sleep } from "./player";
import { buttonTimeline, listTimeline, occlusionTimeline } from "./timelines";
import type { ChatMessage, Demo, DemoApi } from "./types";

const params = new URLSearchParams(location.search);
const demoParam = params.get("demo");
const demo: Demo =
  demoParam === "button" ? "button" : demoParam === "occlusion" ? "occlusion" : "list";
// Plays automatically by default; the recorder relies on this. ?autoplay=0 to inspect statically.
const autoplay = params.get("autoplay") !== "0";

export function Harness() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [buttonFixed, setButtonFixed] = useState(false);
  const listRef = useRef<ListHandle>(null);
  const occlusionRef = useRef<OcclusionHandle>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!autoplay || started.current) return;
    started.current = true;

    const chat = new ChatController(setMessages);
    const api: DemoApi = {
      clickItem: (n, fixed) => listRef.current?.click(n, fixed),
      setButtonFixed,
      revealOverlap: () => occlusionRef.current?.reveal(),
      fixOverlap: () => occlusionRef.current?.fix(),
    };

    // ~1s of calm before the user starts typing. encode.sh trims 0.6s of white
    // pre-render frames off the front, so add that back on top of the visible lead-in.
    const LEAD_IN_MS = 1600;

    (async () => {
      await sleep(LEAD_IN_MS);
      const timeline =
        demo === "button"
          ? buttonTimeline
          : demo === "occlusion"
            ? occlusionTimeline
            : listTimeline;
      await play(timeline, chat, api);
      await sleep(200);
      (window as { __demoComplete?: boolean }).__demoComplete = true;
    })();
  }, []);

  return (
    <div className="harness">
      <ChatPanel messages={messages} />
      <main className="stage">
        {demo === "button" ? (
          <ButtonOverflow fixed={buttonFixed} />
        ) : demo === "occlusion" ? (
          <Occlusion ref={occlusionRef} />
        ) : (
          <ListBug ref={listRef} />
        )}
      </main>
    </div>
  );
}

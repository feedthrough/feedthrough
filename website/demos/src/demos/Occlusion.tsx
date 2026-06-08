import { forwardRef, useImperativeHandle, useState } from "react";

export interface OcclusionHandle {
  /** Outline the (invisible) message container so the viewer sees it cover the buttons. */
  reveal(): void;
  /** The fix: trim the container so it no longer overlaps the buttons. */
  fix(): void;
}

/**
 * Occlusion demo. The message text lives in a container that is padded well past
 * its text and pulled back up with a negative margin, so its invisible box sits
 * on top of both buttons. A real pointer click hit-tests the topmost element and
 * lands on the container, not the button — so users can't click it, even though
 * the buttons are perfectly visible and enabled. (A programmatic el.click() still
 * fires, which is exactly why this slips past tests; inspect_element's hit-test
 * catches it.) `reveal()` outlines the culprit; `fix()` trims it.
 */
export const Occlusion = forwardRef<OcclusionHandle>((_props, ref) => {
  const [fixed, setFixed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [cleared, setCleared] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      reveal() {
        setRevealed(true);
      },
      fix() {
        // Keep the outline on the container while it retracts off the buttons,
        // so the viewer sees exactly what got fixed; fade it out after a beat.
        setFixed(true);
        setCleared(true);
        setTimeout(() => setCleared(false), 900);
        setTimeout(() => setRevealed(false), 1400);
      },
    }),
    [],
  );

  const messageClass = [
    "message",
    fixed ? "" : "message-bug",
    revealed ? "message-revealed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="card dialog">
      <h2 className="card-title">Discard changes?</h2>
      <div className={messageClass}>
        You have unsaved changes. Discarding them now can't be undone.
        {revealed && !fixed && <span className="message-tag">div.message</span>}
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost">
          Cancel
        </button>
        <button type="button" className={`btn btn-danger ${cleared ? "btn-reachable" : ""}`}>
          Discard
        </button>
      </div>
    </div>
  );
});

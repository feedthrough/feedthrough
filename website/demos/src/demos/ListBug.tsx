import { forwardRef, useImperativeHandle, useState } from "react";

const ITEMS = ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"];

export interface ListHandle {
  /** Click "Item N" (1-based). When buggy, the row below ticks instead. */
  click(displayIndex: number, fixed?: boolean): void;
}

/**
 * The off-by-one demo. The handler that decides which row to tick adds 1 to the
 * index — clicking "Item 3" ticks "Item 4". `fixed` drops the +1.
 */
export const ListBug = forwardRef<ListHandle>((_props, ref) => {
  const [ticked, setTicked] = useState<number | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      click(displayIndex, fixed = false) {
        const index = displayIndex - 1; // zero-based
        const wrongIndex = index + 1; // ← the bug
        setTicked(fixed ? index : wrongIndex);
      },
    }),
    [],
  );

  return (
    <div className="card">
      <h2 className="card-title">Checklist</h2>
      <ul className="list">
        {ITEMS.map((label, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static demo list, never reordered
          <li key={i} className={`row ${ticked === i ? "row-on" : ""}`}>
            <span className="box">{ticked === i ? "☑" : "☐"}</span>
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
});

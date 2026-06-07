// ── Data ──────────────────────────────────────────────────────────────────────

const TEAM = [
  { id: 1, name: "Alice Chen", department: "Platform" },
  { id: 2, name: "Bob Martinez", department: "Product" },
  { id: 3, name: "Carol Smith", department: "Platform" },
  { id: 4, name: "David Kim", department: "Product" },
  { id: 5, name: "Eve Johnson", department: "Data" },
  { id: 6, name: "Frank Lee", department: "Data" },
];

// ── Section 1: Page view counter ──────────────────────────────────────────────
// BUG: increments state by 2 but logs the correct +1 value.

let views = 0;
const viewCountEl = document.getElementById("view-count");

document.getElementById("record-view-btn").addEventListener("click", () => {
  const next = views + 1;
  console.log("page view recorded, total:", next); // logs correct value
  views += 2; // BUG: off-by-one — should be `views += 1`
  viewCountEl.textContent = views;
});

// ── Section 2: Team member search ────────────────────────────────────────────
// BUG: name comparison is case-sensitive; "alice" finds nothing, "Alice" works.

const searchInput = document.getElementById("search-input");
const resultCount = document.getElementById("result-count");
const memberList = document.getElementById("member-list");

function renderTeam(query) {
  const results = TEAM.filter(
    m =>
      m.name.includes(query) || // BUG: missing .toLowerCase() on m.name
      m.department.toLowerCase().includes(query.toLowerCase()),
  );
  resultCount.textContent = query
    ? `${results.length} of ${TEAM.length} members match`
    : `${TEAM.length} members`;
  memberList.innerHTML = results
    .map(
      m =>
        `<li data-member-id="${m.id}" style="padding:6px 0;border-bottom:1px solid #eee">
      <strong>${m.name}</strong> — ${m.department}
    </li>`,
    )
    .join("");
}

renderTeam("");
searchInput.addEventListener("input", e => {
  console.log("searching team for:", e.target.value);
  renderTeam(e.target.value);
});

// ── Section 3: Activity feed ──────────────────────────────────────────────────
// BUG: fetches from /api/events (404); error is caught but not shown to the user.

const feedStatus = document.getElementById("feed-status");
const eventList = document.getElementById("event-list");

document.getElementById("refresh-btn").addEventListener("click", async () => {
  feedStatus.textContent = "Loading…";
  console.log("refreshing activity feed...");
  try {
    // BUG: wrong URL — should be https://jsonplaceholder.typicode.com/posts?_limit=5
    const res = await fetch("/api/events");
    const data = await res.json();
    eventList.innerHTML = data
      .map(e => `<li style="padding:6px 0;border-bottom:1px solid #eee">${e.message}</li>`)
      .join("");
    feedStatus.textContent = "";
    console.log("feed loaded,", data.length, "events");
  } catch (err) {
    // BUG: error swallowed — user sees nothing, no error state shown
    console.error("feed fetch failed:", err);
    feedStatus.textContent = "No events yet. Click Refresh.";
  }
});

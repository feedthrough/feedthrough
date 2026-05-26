import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: number;
  name: string;
  role: string;
  department: string;
}

interface Event {
  id: number;
  message: string;
  ts: string;
}

// ── Data ──────────────────────────────────────────────────────────────────────

const TEAM: TeamMember[] = [
  { id: 1, name: "Alice Chen",    role: "Engineer",  department: "Platform" },
  { id: 2, name: "Bob Martinez",  role: "Designer",  department: "Product" },
  { id: 3, name: "Carol Smith",   role: "Engineer",  department: "Platform" },
  { id: 4, name: "David Kim",     role: "Manager",   department: "Product" },
  { id: 5, name: "Eve Johnson",   role: "Engineer",  department: "Data" },
  { id: 6, name: "Frank Lee",     role: "Analyst",   department: "Data" },
];

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <main style={{ fontFamily: "sans-serif", maxWidth: 640, margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{ marginBottom: 32 }}>Team Dashboard</h1>
      <PageViewCounter />
      <hr style={{ margin: "32px 0" }} />
      <TeamSearch />
      <hr style={{ margin: "32px 0" }} />
      <ActivityFeed />
    </main>
  );
}

// ── Section 1: Page view counter ──────────────────────────────────────────────
// BUG: increments state by 2 but logs the correct +1 value, so the displayed
// count is always 1 ahead of what the logs show.

function PageViewCounter() {
  const [views, setViews] = useState(0);

  function recordView() {
    const next = views + 1;
    console.log("page view recorded, total:", next);
    setViews(views + 2); // BUG: off-by-one — should be `next` or `views + 1`
  }

  return (
    <section id="counter-section">
      <h2>Page Views</h2>
      <p>
        Total views: <strong id="view-count">{views}</strong>
      </p>
      <button id="record-view-btn" onClick={recordView}>
        Record View
      </button>
      <p style={{ color: "#888", fontSize: 13 }}>
        Each click should add 1 view.
      </p>
    </section>
  );
}

// ── Section 2: Team member search ────────────────────────────────────────────
// BUG: search is case-sensitive — searching "alice" finds nothing, "Alice" works.

function TeamSearch() {
  const [query, setQuery] = useState("");

  const results = TEAM.filter(
    (m) =>
      // BUG: missing .toLowerCase() on m.name — case-sensitive match
      m.name.includes(query) ||
      m.department.toLowerCase().includes(query.toLowerCase())
  );

  function handleSearch(q: string) {
    console.log("searching team for:", q);
    setQuery(q);
  }

  return (
    <section id="search-section">
      <h2>Team Directory</h2>
      <input
        id="search-input"
        type="text"
        placeholder="Search by name or department…"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        style={{ width: "100%", padding: "6px 8px", marginBottom: 12, boxSizing: "border-box" }}
      />
      <p id="result-count" style={{ color: "#888", fontSize: 13 }}>
        {query ? `${results.length} of ${TEAM.length} members match` : `${TEAM.length} members`}
      </p>
      <ul id="member-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {results.map((m) => (
          <li key={m.id} data-member-id={m.id} style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
            <strong>{m.name}</strong> — {m.role}, {m.department}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Section 3: Activity feed ──────────────────────────────────────────────────
// BUG: fetches from /api/events (doesn't exist) instead of the real endpoint.
// The error is caught and logged but never shown to the user, so it looks like
// a successful empty response.

function ActivityFeed() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    console.log("refreshing activity feed...");
    try {
      // BUG: wrong URL — should be https://jsonplaceholder.typicode.com/posts?_limit=5
      const res = await fetch("/api/events");
      const data = await res.json();
      setEvents(data);
      console.log("feed loaded,", data.length, "events");
    } catch (err) {
      // BUG: error is swallowed — user sees nothing, no error state set
      console.error("feed fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="feed-section">
      <h2>Activity Feed</h2>
      <button id="refresh-btn" onClick={refresh} disabled={loading}>
        {loading ? "Loading…" : "Refresh Feed"}
      </button>
      {events.length === 0 && !loading && (
        <p id="empty-state" style={{ color: "#888", fontSize: 13, marginTop: 8 }}>
          No events yet. Click Refresh.
        </p>
      )}
      <ul id="event-list" style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
        {events.map((e) => (
          <li key={e.id} style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
            {e.message} <span style={{ color: "#aaa", fontSize: 12 }}>{e.ts}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

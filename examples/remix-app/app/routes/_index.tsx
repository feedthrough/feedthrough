import { useState } from "react";

const TEAM = [
  { id: 1, name: "Alice Chen",   department: "Platform" },
  { id: 2, name: "Bob Martinez", department: "Product"  },
  { id: 3, name: "Carol Smith",  department: "Platform" },
  { id: 4, name: "David Kim",    department: "Product"  },
  { id: 5, name: "Eve Johnson",  department: "Data"     },
  { id: 6, name: "Frank Lee",    department: "Data"     },
];

export default function Index() {
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

// BUG: increments state by 2 but logs +1
function PageViewCounter() {
  const [views, setViews] = useState(0);
  function recordView() {
    const next = views + 1;
    console.log("page view recorded, total:", next);
    setViews(views + 2);
  }
  return (
    <section id="counter-section">
      <h2>Page Views</h2>
      <p>Total views: <strong id="view-count">{views}</strong></p>
      <button id="record-view-btn" onClick={recordView}>Record View</button>
      <p style={{ color: "#888", fontSize: 13 }}>Each click should add 1 view.</p>
    </section>
  );
}

// BUG: case-sensitive name search (missing .toLowerCase() on m.name)
function TeamSearch() {
  const [query, setQuery] = useState("");
  const results = TEAM.filter(m =>
    m.name.includes(query) ||
    m.department.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <section id="search-section">
      <h2>Team Directory</h2>
      <input
        id="search-input"
        type="text"
        placeholder="Search by name or department…"
        value={query}
        onChange={e => { console.log("searching team for:", e.target.value); setQuery(e.target.value); }}
        style={{ width: "100%", padding: "6px 8px", marginBottom: 12, boxSizing: "border-box" }}
      />
      <p id="result-count" style={{ color: "#888", fontSize: 13 }}>
        {query ? `${results.length} of ${TEAM.length} members match` : `${TEAM.length} members`}
      </p>
      <ul id="member-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {results.map(m => (
          <li key={m.id} data-member-id={m.id} style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
            <strong>{m.name}</strong> — {m.department}
          </li>
        ))}
      </ul>
    </section>
  );
}

// BUG: fetches from /api/events (404), error swallowed
function ActivityFeed() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("No events yet. Click Refresh.");
  async function refresh() {
    setLoading(true);
    console.log("refreshing activity feed...");
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      console.log("feed loaded,", data.length, "events");
      setStatus("");
    } catch (err) {
      console.error("feed fetch failed:", err);
      setStatus("No events yet. Click Refresh.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <section id="feed-section">
      <h2>Activity Feed</h2>
      <button id="refresh-btn" disabled={loading} onClick={refresh}>
        {loading ? "Loading…" : "Refresh Feed"}
      </button>
      <p id="feed-status" style={{ color: "#888", fontSize: 13, marginTop: 8 }}>{status}</p>
    </section>
  );
}

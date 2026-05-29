<script lang="ts">
  import { onMount } from "svelte";

  const team = [
    { id: 1, name: "Alice Chen",   department: "Platform" },
    { id: 2, name: "Bob Martinez", department: "Product"  },
    { id: 3, name: "Carol Smith",  department: "Platform" },
    { id: 4, name: "David Kim",    department: "Product"  },
    { id: 5, name: "Eve Johnson",  department: "Data"     },
    { id: 6, name: "Frank Lee",    department: "Data"     },
  ];

  // BUG 1: increments by 2 but logs +1
  let views = $state(0);
  function recordView() {
    const next = views + 1;
    console.log("page view recorded, total:", next);
    views += 2;
  }

  // BUG 2: case-sensitive name search (missing .toLowerCase() on m.name)
  let query = $state("");
  let filteredTeam = $derived(
    team.filter(m =>
      m.name.includes(query) ||
      m.department.toLowerCase().includes(query.toLowerCase())
    )
  );
  function onSearch(e: Event) {
    query = (e.target as HTMLInputElement).value;
    console.log("searching team for:", query);
  }

  // BUG 3: wrong URL — /api/events returns 404, error swallowed
  let loading = $state(false);
  let feedStatus = $state("No events yet. Click Refresh.");
  async function refreshFeed() {
    loading = true;
    console.log("refreshing activity feed...");
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      console.log("feed loaded,", data.length, "events");
      feedStatus = "";
    } catch (err) {
      console.error("feed fetch failed:", err);
      feedStatus = "No events yet. Click Refresh.";
    } finally {
      loading = false;
    }
  }
</script>

<main style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 20px">
  <h1 style="margin-bottom:32px">Team Dashboard</h1>

  <section id="counter-section">
    <h2>Page Views</h2>
    <p>Total views: <strong id="view-count">{views}</strong></p>
    <button id="record-view-btn" onclick={recordView}>Record View</button>
    <p style="color:#888;font-size:13px">Each click should add 1 view.</p>
  </section>

  <hr style="margin:32px 0" />

  <section id="search-section">
    <h2>Team Directory</h2>
    <input
      id="search-input"
      type="text"
      placeholder="Search by name or department…"
      value={query}
      oninput={onSearch}
      style="width:100%;padding:6px 8px;box-sizing:border-box;margin-bottom:12px"
    />
    <p id="result-count" style="color:#888;font-size:13px">
      {query ? `${filteredTeam.length} of ${team.length} members match` : `${team.length} members`}
    </p>
    <ul id="member-list" style="list-style:none;padding:0;margin:0">
      {#each filteredTeam as m (m.id)}
        <li data-member-id={m.id} style="padding:6px 0;border-bottom:1px solid #eee">
          <strong>{m.name}</strong> — {m.department}
        </li>
      {/each}
    </ul>
  </section>

  <hr style="margin:32px 0" />

  <section id="feed-section">
    <h2>Activity Feed</h2>
    <button id="refresh-btn" disabled={loading} onclick={refreshFeed}>
      {loading ? "Loading…" : "Refresh Feed"}
    </button>
    <p id="feed-status" style="color:#888;font-size:13px;margin-top:8px">{feedStatus}</p>
  </section>
</main>

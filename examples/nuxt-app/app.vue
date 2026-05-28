<template>
  <main style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 20px">
    <h1 style="margin-bottom:32px">Team Dashboard</h1>

    <!-- BUG 1: counter increments by 2 but logs +1 -->
    <section id="counter-section">
      <h2>Page Views</h2>
      <p>Total views: <strong id="view-count">{{ views }}</strong></p>
      <button id="record-view-btn" @click="recordView">Record View</button>
      <p style="color:#888;font-size:13px">Each click should add 1 view.</p>
    </section>

    <hr style="margin:32px 0">

    <!-- BUG 2: case-sensitive name search -->
    <section id="search-section">
      <h2>Team Directory</h2>
      <input
        id="search-input"
        v-model="query"
        type="text"
        placeholder="Search by name or department…"
        style="width:100%;padding:6px 8px;box-sizing:border-box;margin-bottom:12px"
        @input="onSearch"
      />
      <p id="result-count" style="color:#888;font-size:13px">
        {{ query ? `${filteredTeam.length} of ${team.length} members match` : `${team.length} members` }}
      </p>
      <ul id="member-list" style="list-style:none;padding:0;margin:0">
        <li
          v-for="m in filteredTeam"
          :key="m.id"
          :data-member-id="m.id"
          style="padding:6px 0;border-bottom:1px solid #eee"
        >
          <strong>{{ m.name }}</strong> — {{ m.department }}
        </li>
      </ul>
    </section>

    <hr style="margin:32px 0">

    <!-- BUG 3: fetch from /api/events (404), error swallowed -->
    <section id="feed-section">
      <h2>Activity Feed</h2>
      <button id="refresh-btn" :disabled="loading" @click="refreshFeed">
        {{ loading ? "Loading…" : "Refresh Feed" }}
      </button>
      <p id="feed-status" style="color:#888;font-size:13px;margin-top:8px">{{ feedStatus }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";

const team = [
  { id: 1, name: "Alice Chen",   department: "Platform" },
  { id: 2, name: "Bob Martinez", department: "Product"  },
  { id: 3, name: "Carol Smith",  department: "Platform" },
  { id: 4, name: "David Kim",    department: "Product"  },
  { id: 5, name: "Eve Johnson",  department: "Data"     },
  { id: 6, name: "Frank Lee",    department: "Data"     },
];

// Counter
const views = ref(0);
function recordView() {
  const next = views.value + 1;
  console.log("page view recorded, total:", next);
  views.value += 2; // BUG: off-by-one — should be += 1
}

// Search
const query = ref("");
const filteredTeam = computed(() =>
  team.filter(m =>
    m.name.includes(query.value) || // BUG: missing .toLowerCase() on m.name
    m.department.toLowerCase().includes(query.value.toLowerCase())
  )
);
function onSearch() {
  console.log("searching team for:", query.value);
}

// Feed
const loading = ref(false);
const feedStatus = ref("No events yet. Click Refresh.");
async function refreshFeed() {
  loading.value = true;
  console.log("refreshing activity feed...");
  try {
    // BUG: wrong URL — should be https://jsonplaceholder.typicode.com/posts?_limit=5
    const res = await fetch("/api/events");
    const data = await res.json();
    console.log("feed loaded,", data.length, "events");
    feedStatus.value = "";
  } catch (err) {
    // BUG: error swallowed — user sees nothing
    console.error("feed fetch failed:", err);
    feedStatus.value = "No events yet. Click Refresh.";
  } finally {
    loading.value = false;
  }
}
</script>

<script setup lang="ts">
import { ref } from "vue";

const views = ref(0);

function recordView() {
  const next = views.value + 1;
  console.log("page view recorded, total:", next);
  views.value += 2; // BUG: off-by-one — should be `next` or `+= 1`
}
</script>

<template>
  <main style="font-family: sans-serif; max-width: 480px; margin: 40px auto; padding: 0 20px">
    <h1>Page View Counter (Vue)</h1>
    <p>Total views: <strong id="view-count">{{ views }}</strong></p>
    <button id="record-view-btn" @click="recordView">Record View</button>
    <p style="color: #888; font-size: 13px">Each click should add 1 view.</p>
  </main>
</template>

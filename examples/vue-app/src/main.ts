import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");

if (import.meta.env.DEV) {
  import("@feedthrough/core").then(({ init }) => init());
}

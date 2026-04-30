import { defineStore } from "pinia";
import { computed, ref, watchEffect } from "vue";

type Mode = "light" | "dark" | "system";

export const useThemeStore = defineStore(
  "theme",
  () => {
    const mode = ref<Mode>("system");

    const effective = computed<"light" | "dark">(() => {
      if (mode.value === "system") {
        return typeof window !== "undefined" &&
          window.matchMedia?.("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      }
      return mode.value;
    });

    watchEffect(() => {
      if (typeof document === "undefined") return;
      const root = document.documentElement;
      root.classList.toggle("dark", effective.value === "dark");
    });

    function set(m: Mode) {
      mode.value = m;
    }

    function toggle() {
      mode.value = effective.value === "dark" ? "light" : "dark";
    }

    return { mode, effective, set, toggle };
  },
  {
    persist: {
      pick: ["mode"],
    },
  }
);

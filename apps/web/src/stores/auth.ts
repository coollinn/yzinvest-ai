import type { AuthResponse, User } from "@yzinvest/shared";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { apiGet, apiPost, setOnUnauthorized, setTokenProvider } from "@/lib/api";

export const useAuthStore = defineStore(
  "auth",
  () => {
    const user = ref<User | null>(null);
    const accessToken = ref<string | null>(null);
    const refreshToken = ref<string | null>(null);

    const isAuthenticated = computed(() => !!accessToken.value && !!user.value);
    const isAdmin = computed(() => user.value?.role === "admin");

    setTokenProvider(() => accessToken.value);
    setOnUnauthorized(() => {
      // Token 失效 — 清掉，让前端跳到登录页
      accessToken.value = null;
      refreshToken.value = null;
      user.value = null;
    });

    async function fetchMe() {
      try {
        user.value = await apiGet<User>("/auth/me");
      } catch {
        accessToken.value = null;
        refreshToken.value = null;
        user.value = null;
      }
    }

    async function init() {
      if (accessToken.value) {
        await fetchMe();
      }
    }

    async function register(input: {
      username: string;
      email: string;
      password: string;
      full_name?: string;
    }) {
      const resp = await apiPost<AuthResponse>("/auth/register", input);
      accessToken.value = resp.access_token;
      refreshToken.value = resp.refresh_token;
      user.value = resp.user;
      return resp;
    }

    async function login(input: { username: string; password: string }) {
      const resp = await apiPost<AuthResponse>("/auth/login", input);
      accessToken.value = resp.access_token;
      refreshToken.value = resp.refresh_token;
      user.value = resp.user;
      return resp;
    }

    function setUser(u: User) {
      user.value = u;
    }

    async function logout() {
      try {
        if (accessToken.value) await apiPost("/auth/logout");
      } catch {
        // ignore
      }
      accessToken.value = null;
      refreshToken.value = null;
      user.value = null;
    }

    return {
      user,
      accessToken,
      refreshToken,
      isAuthenticated,
      isAdmin,
      init,
      fetchMe,
      register,
      login,
      logout,
      setUser,
    };
  },
  {
    persist: {
      pick: ["accessToken", "refreshToken"],
    },
  }
);

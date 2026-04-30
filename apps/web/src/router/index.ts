import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: () => import("@/pages/Home.vue") },
    { path: "/stocks", name: "stocks", component: () => import("@/pages/Stocks.vue") },
    {
      path: "/stocks/:tsCode",
      name: "stock-detail",
      component: () => import("@/pages/StockDetail.vue"),
    },
    {
      path: "/favorites",
      name: "favorites",
      component: () => import("@/pages/Favorites.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/notes",
      name: "notes",
      component: () => import("@/pages/Notes.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/pages/Settings.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/admin",
      name: "admin",
      component: () => import("@/pages/Admin.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    { path: "/login", name: "login", component: () => import("@/pages/Login.vue") },
    { path: "/register", name: "register", component: () => import("@/pages/Register.vue") },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("@/pages/NotFound.vue"),
    },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: "home" };
  }
  return true;
});

export default router;

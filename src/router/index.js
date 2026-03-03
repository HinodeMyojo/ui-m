import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import LoginView from "../views/LoginView.vue";
import SkillsView from "../views/SkillsView.vue";
import CanvasView from "../views/CanvasView.vue";
import MdToMdfView from "@/views/MdToMdfView.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomeView,
    },
    {
      path: "/mdToPdf",
      name: "mdToPdf",
      component: MdToMdfView,
    },
    {
      path: "/login",
      name: "login",
      component: LoginView,
    },
    {
      path: "/skills",
      name: "Skills",
      component: SkillsView,
    },
    {
      path: "/canvas",
      name: "CanvasList",
      component: CanvasView,
    },
    {
      path: "/canvas/:id",
      name: "CanvasEditor",
      component: () => import("../components/canvas/CanvasEditor.vue"),
    },
  ],
});

// Navigation guard
router.beforeEach((to, from, next) => {
  const isAuth = localStorage.getItem("token");
  if (to.path !== "/login" && !isAuth) {
    next("/login");
  } else if (to.path === "/login" && isAuth) {
    next("/");
  } else {
    next();
  }
});

export default router;

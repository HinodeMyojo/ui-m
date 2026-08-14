import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import LoginView from "../views/LoginView.vue";
import SkillsView from "../views/SkillsView.vue";
import SkillTreeView from "../views/SkillTreeView.vue";
import MdToMdfView from "@/views/MdToMdfView.vue";
import PdfReaderView from "@/views/PdfReaderView.vue";
import VocabularyView from "@/views/VocabularyView.vue";

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
      path: "/skill-tree",
      name: "SkillTree",
      component: SkillTreeView,
    },
    {
      path: "/pdfReader",
      name: "pdfReader",
      component: PdfReaderView,
    },
    {
      path: "/vocabulary",
      name: "Vocabulary",
      component: VocabularyView,
    },
    {
      path: "/diagrams",
      name: "Diagrams",
      component: () => import("../views/DiagramsView.vue"),
    },
    {
      path: "/diagrams/:id",
      name: "DiagramEditor",
      component: () => import("../views/DiagramEditorView.vue"),
    },
    {
      path: "/budget",
      name: "Budget",
      component: () => import("../views/budget/BudgetView.vue"),
    },
    {
      path: "/journey",
      name: "JourneyMap",
      component: () => import("../views/JourneyMapView.vue"),
    },
    {
      path: "/learning-skills",
      name: "LearningSkills",
      component: () => import("../views/LearningSkillsView.vue"),
    },
    {
      path: "/testing",
      name: "Testing",
      component: () => import("../views/TestingView.vue"),
    },
    {
      path: "/discipline",
      name: "Discipline",
      component: () => import("../views/DisciplineView.vue"),
    },
    {
      path: "/today",
      name: "Workspace",
      component: () => import("../views/WorkspaceView.vue"),
    },
    {
      path: "/sport",
      name: "Sport",
      component: () => import("../views/SportView.vue"),
    },
    {
      // Мобильный ввод дня: фото, вес, галочки. Отдельная раскладка, не адаптив.
      path: "/sport/today",
      name: "SportToday",
      component: () => import("../views/SportTodayView.vue"),
    },
    {
      path: "/travel",
      name: "TravelCountries",
      component: () => import("../views/travel/TravelCountriesView.vue"),
    },
    {
      path: "/travel/countries/:id",
      name: "TravelCountry",
      component: () => import("../views/travel/CountryView.vue"),
    },
    {
      path: "/travel/trips/:id",
      name: "Trip",
      component: () => import("../views/travel/TripView.vue"),
    },
    {
      // Режим «в поездке» для телефона: без :id открывает активную поездку.
      path: "/travel/today/:id?",
      name: "TripToday",
      component: () => import("../views/travel/TripTodayView.vue"),
    },
    {
      path: "/library",
      name: "Library",
      component: () => import("../views/LibraryView.vue"),
    },
    {
      path: "/roadmap",
      name: "Roadmap",
      component: () => import("../views/RoadmapView.vue"),
    },
    {
      // Экран чтения для телефона: отдельная раскладка, не адаптив.
      path: "/roadmap/today",
      name: "RoadmapToday",
      component: () => import("../views/RoadmapTodayView.vue"),
    },
    {
      path: "/resume",
      name: "Resume",
      component: () => import("../views/ResumeView.vue"),
    },
    {
      // Мобильная раскладка: плановые строки по дедлайну. Не адаптив.
      path: "/resume/today",
      name: "ResumeToday",
      component: () => import("../views/ResumeTodayView.vue"),
    },
    {
      path: "/resume/library",
      name: "ResumeLibrary",
      component: () => import("../views/ResumeLibraryView.vue"),
    },
    {
      path: "/resume/vacancies",
      name: "ResumeVacancies",
      component: () => import("../views/ResumeVacanciesView.vue"),
    },
    {
      path: "/resume/:id",
      name: "ResumeEditor",
      component: () => import("../views/ResumeEditorView.vue"),
    },
    {
      // PDF печатает браузер: превью и печать — один и тот же компонент.
      path: "/resume/:id/print",
      name: "ResumePrint",
      component: () => import("../views/ResumePrintView.vue"),
    },
    {
      // Гостевой доступ по ссылке — вход в приложение не нужен.
      path: "/travel/shared/:token",
      name: "SharedTrip",
      component: () => import("../views/travel/PublicTripView.vue"),
      meta: { public: true },
    },
  ],
});

// Navigation guard
router.beforeEach((to, from, next) => {
  const isAuth = localStorage.getItem("token");
  // Гостевые страницы открываются по ссылке, без входа в приложение.
  if (to.meta?.public) {
    next();
  } else if (to.path !== "/login" && !isAuth) {
    next("/login");
  } else if (to.path === "/login" && isAuth) {
    next("/");
  } else {
    next();
  }
});

export default router;

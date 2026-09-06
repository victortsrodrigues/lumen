import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-error";

import { AuthProvider } from "./hooks/use-auth-context";

// Core Pages
import Login from "./pages/login";
import Register from "./pages/register";
import ForgotPassword from "./pages/forgot-password";
import ResetPassword from "./pages/reset-password";
import VerifyEmail from "./pages/verify-email";
import MfaVerify from "./pages/mfa-verify";
import Dashboard from "./pages/dashboard";
import AuditLogs from "./pages/audit-logs";
import AccountsAdminPage from "./pages/admin/accounts";
import NotFound from "./pages/not-found";

// Members Module
import MembersList from "./pages/members";
import NewMember from "./pages/members/new";
import MemberProfile from "./pages/members/[id]";
import EditMember from "./pages/members/[id]/edit";
import ImportMembers from "./pages/members/import";
import MemberGroupsPage from "./pages/members/groups";

// Visitors Module
import VisitorsList from "./pages/visitors";
import NewVisitor from "./pages/visitors/new";
import VisitorDetail from "./pages/visitors/[id]";
import EditVisitor from "./pages/visitors/[id]/edit";

// Discipleship Module
import DiscipleshipPage from "./pages/discipleship";

// Conselho Module
import ConselhoListPage from "./pages/conselho";
import NewConselhoPage from "./pages/conselho/new";
import ConselhoDetailPage from "./pages/conselho/[id]";
import EditConselhoPage from "./pages/conselho/[id]/edit";

// Finance Module
import FinanceDashboard from "./pages/finance";
import FinanceEntries from "./pages/finance/entries";
import FinanceExpenses from "./pages/finance/expenses";
import FinanceReport from "./pages/finance/report";
import FinanceClosings from "./pages/finance/closings";
import FinanceBudget from "./pages/finance/budget";
import FinanceBudgetComparison from "./pages/finance/budget-comparison";

// Teaching Module
import TeachingDashboard from "./pages/teaching";
import TeachingCourses from "./pages/teaching/courses";
import TeachingCourseDetail from "./pages/teaching/course-detail";
import TeachingAttendance from "./pages/teaching/attendance";
import TeachingMyCourses from "./pages/teaching/my-courses";
import TeachingMyCourseContent from "./pages/teaching/my-course-content";
import TeachingContents from "./pages/teaching/contents";
import TeachingContentDetail from "./pages/teaching/content-detail";

// Events Module
import EventsPage from "./pages/events";
import EventDetailPage from "./pages/events/event-detail";

// Ministries Module
import MinistriesPage from "./pages/ministries";
import MinistryDetailPage from "./pages/ministries/ministry-detail";

// Assets Module
import AssetsPage from "./pages/assets";

// Schedules Module
import ServiceRolesPage from "./pages/schedules/roles";

// Planning Module
import PlanningDashboard from "./pages/planning";
import PlanningDirectives from "./pages/planning/directives";
import PlanningInitiatives from "./pages/planning/initiatives";

// Profile (own data for member/leader)
import ProfilePage from "./pages/profile";

// Pastoral Module
import PastoralPage from "./pages/pastoral";

// Counseling Module
import CounselingPage from "./pages/counseling";
import CounselingCaseDetail from "./pages/counseling/case-detail";

// Songs Module
import SongsPage from "./pages/songs";
import SongDetailPage from "./pages/songs/song-detail";

// Cultos Module
import CultosListPage from "./pages/cultos";
import NewCultoPage from "./pages/cultos/new";
import CultoDetailPage from "./pages/cultos/[id]";
import EditCultoPage from "./pages/cultos/[id]/edit";
import CultosReportsPage from "./pages/cultos/reports";

// Articles Module
import ArticlesPage from "./pages/articles";
import NewArticle from "./pages/articles/new";
import ArticleDetailPage from "./pages/articles/article-detail";

// Forum Module
import ForumPage from "./pages/forum";
import ForumTopicDetail from "./pages/forum/topic-detail";

// Institutional Module
import InstitutionalPage from "./pages/institutional";

// PIX Module
import PixAdminPage from "./pages/pix/admin";
import ContributionsPage from "./pages/contributions";

// Public Pages
import PublicSite from "./pages/public/site";
import PublicPage from "./pages/public/page";
import PublicDonate from "./pages/public/donate";

// LGPD Module
import LgpdMyData from "./pages/lgpd/my-data";
import LgpdAdminRequests from "./pages/lgpd/admin-requests";

// Global mutation cache:
// - onSuccess: auto-invalidates all /api/* queries so lists/details refresh
//   without manual invalidation calls.
// - onError: shows a toast with the actual backend error message (unless the
//   mutation opts out via `meta.silentError`).
let queryClient: QueryClient;
queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
  mutationCache: new MutationCache({
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/");
        },
      });
    },
    onError: (error, _vars, _ctx, mutation) => {
      // Opt-out: pages that want to handle the error themselves can set
      // meta: { silentError: true } on the mutation options.
      if (mutation.meta?.silentError) return;
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  }),
});

function Router() {
  return (
    <Switch>
      {/* Public Pages (no auth) */}
      <Route path="/site/:slug" component={PublicPage} />
      <Route path="/site" component={PublicSite} />
      <Route path="/donate" component={PublicDonate} />

      {/* Public / Auth Routes */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/mfa-verify" component={MfaVerify} />
      
      {/* Dashboard & Admin */}
      <Route path="/" component={Dashboard} />
      <Route path="/audit-logs" component={AuditLogs} />
      <Route path="/admin/accounts" component={AccountsAdminPage} />
      
      {/* Members Module */}
      <Route path="/members/new" component={NewMember} />
      <Route path="/members/import" component={ImportMembers} />
      <Route path="/members/groups" component={MemberGroupsPage} />
      <Route path="/members/:id/edit" component={EditMember} />
      <Route path="/members/:id" component={MemberProfile} />
      <Route path="/members" component={MembersList} />

      {/* Visitors Module */}
      <Route path="/visitors/new" component={NewVisitor} />
      <Route path="/visitors/:id/edit" component={EditVisitor} />
      <Route path="/visitors/:id" component={VisitorDetail} />
      <Route path="/visitors" component={VisitorsList} />

      {/* Discipleship Module */}
      <Route path="/discipleship" component={DiscipleshipPage} />

      {/* Conselho Module */}
      <Route path="/conselho/new" component={NewConselhoPage} />
      <Route path="/conselho/:id/edit" component={EditConselhoPage} />
      <Route path="/conselho/:id" component={ConselhoDetailPage} />
      <Route path="/conselho" component={ConselhoListPage} />

      {/* Finance Module */}
      <Route path="/finance" component={FinanceDashboard} />
      <Route path="/finance/entries" component={FinanceEntries} />
      <Route path="/finance/expenses" component={FinanceExpenses} />
      <Route path="/finance/report" component={FinanceReport} />
      <Route path="/finance/closings" component={FinanceClosings} />
      <Route path="/finance/budget/comparison" component={FinanceBudgetComparison} />
      <Route path="/finance/budget" component={FinanceBudget} />

      {/* Events Module */}
      <Route path="/events/:id" component={EventDetailPage} />
      <Route path="/events" component={EventsPage} />

      {/* Ministries Module */}
      <Route path="/ministries/:id" component={MinistryDetailPage} />
      <Route path="/ministries" component={MinistriesPage} />

      {/* Assets Module */}
      <Route path="/assets" component={AssetsPage} />

      {/* Schedules Module */}
      <Route path="/schedules/roles" component={ServiceRolesPage} />

      {/* Planning Module */}
      <Route path="/planning/directives" component={PlanningDirectives} />
      <Route path="/planning/initiatives" component={PlanningInitiatives} />
      <Route path="/planning" component={PlanningDashboard} />

      {/* Profile (own data) */}
      <Route path="/profile" component={ProfilePage} />

      {/* Pastoral Module */}
      <Route path="/pastoral" component={PastoralPage} />

      {/* Counseling Module */}
      <Route path="/counseling/:id" component={CounselingCaseDetail} />
      <Route path="/counseling" component={CounselingPage} />

      {/* Songs Module */}
      <Route path="/songs/:id" component={SongDetailPage} />
      <Route path="/songs" component={SongsPage} />

      {/* Cultos Module */}
      <Route path="/cultos/new" component={NewCultoPage} />
      <Route path="/cultos/reports" component={CultosReportsPage} />
      <Route path="/cultos/:id/edit" component={EditCultoPage} />
      <Route path="/cultos/:id" component={CultoDetailPage} />
      <Route path="/cultos" component={CultosListPage} />

      {/* Articles Module */}
      <Route path="/articles/new" component={NewArticle} />
      <Route path="/articles/:id" component={ArticleDetailPage} />
      <Route path="/articles" component={ArticlesPage} />

      {/* Forum Module */}
      <Route path="/forum/:id" component={ForumTopicDetail} />
      <Route path="/forum" component={ForumPage} />

      {/* Institutional Module */}
      <Route path="/pages" component={InstitutionalPage} />

      {/* PIX Module */}
      <Route path="/finance/pix" component={PixAdminPage} />
      <Route path="/contributions" component={ContributionsPage} />

      {/* LGPD Module */}
      <Route path="/lgpd/my-data" component={LgpdMyData} />
      <Route path="/lgpd/admin-requests" component={LgpdAdminRequests} />

      {/* Teaching Module */}
      <Route path="/teaching" component={TeachingDashboard} />
      <Route path="/teaching/courses/:id" component={TeachingCourseDetail} />
      <Route path="/teaching/courses" component={TeachingCourses} />
      <Route path="/teaching/attendance" component={TeachingAttendance} />
      <Route path="/teaching/my-courses/:id" component={TeachingMyCourseContent} />
      <Route path="/teaching/my-courses" component={TeachingMyCourses} />
      <Route path="/teaching/contents/:id" component={TeachingContentDetail} />
      <Route path="/teaching/contents" component={TeachingContents} />

      {/* Fallback */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

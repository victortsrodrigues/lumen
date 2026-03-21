import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider } from "./hooks/use-auth-context";

// Core Pages
import Login from "./pages/login";
import Register from "./pages/register";
import ForgotPassword from "./pages/forgot-password";
import MfaVerify from "./pages/mfa-verify";
import Dashboard from "./pages/dashboard";
import AuditLogs from "./pages/audit-logs";
import NotFound from "./pages/not-found";

// Members Module
import MembersList from "./pages/members";
import NewMember from "./pages/members/new";
import MemberProfile from "./pages/members/[id]";
import EditMember from "./pages/members/[id]/edit";
import ImportMembers from "./pages/members/import";

// Finance Module
import FinanceDashboard from "./pages/finance/dashboard";
import FinanceEntries from "./pages/finance/entries";
import FinanceExpenses from "./pages/finance/expenses";
import FinanceReports from "./pages/finance/reports";
import FinanceClosings from "./pages/finance/closings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Public / Auth Routes */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/mfa-verify" component={MfaVerify} />
      
      {/* Dashboard & Admin */}
      <Route path="/" component={Dashboard} />
      <Route path="/audit-logs" component={AuditLogs} />
      
      {/* Members Module */}
      <Route path="/members" component={MembersList} />
      <Route path="/members/new" component={NewMember} />
      <Route path="/members/import" component={ImportMembers} />
      <Route path="/members/:id/edit" component={EditMember} />
      <Route path="/members/:id" component={MemberProfile} />

      {/* Finance Module */}
      <Route path="/finance" component={FinanceDashboard} />
      <Route path="/finance/entries" component={FinanceEntries} />
      <Route path="/finance/expenses" component={FinanceExpenses} />
      <Route path="/finance/reports" component={FinanceReports} />
      <Route path="/finance/closings" component={FinanceClosings} />
      
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

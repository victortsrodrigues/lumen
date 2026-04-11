import { useAuth } from "@/hooks/use-auth-context";
import AdminDashboard from "./dashboard/admin-dashboard";
import LeaderDashboard from "./dashboard/leader-dashboard";
import MemberDashboard from "./dashboard/member-dashboard";

export default function Dashboard() {
  const { user } = useAuth();

  if (user?.role === "admin") return <AdminDashboard />;
  if (user?.role === "leader") return <LeaderDashboard />;
  return <MemberDashboard />;
}

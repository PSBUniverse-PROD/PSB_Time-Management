import DashboardModules from "@/core/auth/DashboardModules";
import { loadAssignedCardsFromDatabase } from "../data/dashboard.actions";

export default async function DashboardPage() {
  const setupCards = await loadAssignedCardsFromDatabase();
  return <DashboardModules modules={setupCards} />;
}

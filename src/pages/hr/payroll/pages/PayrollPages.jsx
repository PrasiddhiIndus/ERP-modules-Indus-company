import { useLocation } from "react-router-dom";
import { viewFromPath } from "../indus/IndusPayrollPage";
import DashboardPage from "./DashboardPage";
import ProcessSalaryPage from "./ProcessSalaryPage";
import EmployeeMasterPage from "./EmployeeMasterPage";
import HeldSalaryPage from "./HeldSalaryPage";
import LoansRecoveriesPage from "./LoansRecoveriesPage";
import RevisionsPage from "./RevisionsPage";
import ReportsPage from "./ReportsPage";
import RegistersPage from "./RegistersPage";
import StatutoryMastersPage from "./StatutoryMastersPage";
import SiteSetupPage from "./SiteSetupPage";
import SalaryComponentsPage from "./SalaryComponentsPage";
import FormulaMasterPage from "./FormulaMasterPage";

const PAGES = {
  dashboard: DashboardPage,
  process: ProcessSalaryPage,
  employees: EmployeeMasterPage,
  held: HeldSalaryPage,
  loans: LoansRecoveriesPage,
  revisions: RevisionsPage,
  reports: ReportsPage,
  compliance: RegistersPage,
  masters: StatutoryMastersPage,
  setup: SiteSetupPage,
  components: SalaryComponentsPage,
  formulas: FormulaMasterPage,
};

export default function PayrollPages() {
  const view = viewFromPath(useLocation().pathname);
  const Page = PAGES[view] || DashboardPage;
  return <Page />;
}

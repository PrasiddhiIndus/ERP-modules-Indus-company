import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Users,
} from "lucide-react";

const trainingStats = [
  { label: "Active trainings", value: "0", icon: BookOpen, tone: "text-indigo-700 bg-indigo-50" },
  { label: "Employees assigned", value: "0", icon: Users, tone: "text-blue-700 bg-blue-50" },
  { label: "Completions", value: "0", icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50" },
  { label: "Pending / overdue", value: "0", icon: AlertTriangle, tone: "text-amber-700 bg-amber-50" },
];

const workflowCards = [
  {
    title: "Training master",
    description: "Create courses, SOP trainings, compliance sessions, induction content, and refresher modules.",
    icon: FileText,
  },
  {
    title: "Assignments & batches",
    description: "Assign trainings by employee, department, location, role, or batch with target completion dates.",
    icon: Users,
  },
  {
    title: "Calendar & reminders",
    description: "Track upcoming sessions, renewal reminders, pending nominations, and overdue completions.",
    icon: Calendar,
  },
  {
    title: "Reports & certificates",
    description: "Monitor completion percentage, attendance, assessment status, and certificate issue records.",
    icon: BarChart3,
  },
];

const upcomingColumns = ["Training", "Audience", "Owner", "Due date", "Status"];

const IndusLmsTrainings = () => {
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-100 p-2">
            <BookOpen className="h-6 w-6 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Indus LMS / trainings</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Learning management workspace for training masters, employee assignments, reminders, completion tracking,
              and certificates.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New training
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {trainingStats.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{item.value}</p>
                </div>
                <div className={`rounded-lg p-2 ${item.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {workflowCards.map((item) => {
          const Icon = item.icon;
          return (
            <section key={item.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-2 text-slate-700">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-base font-semibold text-slate-900">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
            </section>
          );
        })}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Training tracker</h2>
            <p className="text-sm text-slate-500">
              This area is ready for live training records once the exact LMS entry fields are finalized.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            <Clock className="h-3.5 w-3.5" />
            Setup pending
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[850px] w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                {upcomingColumns.map((column) => (
                  <th key={column} className="px-4 py-3 text-left font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={upcomingColumns.length} className="px-4 py-10 text-center text-slate-500">
                  No trainings created yet. Use this module for induction, compliance, safety, SOP, and refresher
                  training workflows.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default IndusLmsTrainings;

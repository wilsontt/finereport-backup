import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Enterprise IT Management System Design System (Professional, Clean, Minimalist, High Reliability)
export const UI_PRO_MAX = {
  // --- Layout & Structure ---
  appContainer: "min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-200 selection:text-blue-900",
  pageWrapper: "max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10",
  
  // Header
  header: "flex items-center justify-between pb-8 mb-8 border-b border-slate-200",
  headerTitle: "text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-3",
  headerSubtitle: "text-sm text-slate-500 font-medium",
  
  // Cards / Panels
  card: "bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden",
  cardHeader: "px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between",
  cardTitle: "text-lg font-semibold text-slate-800",
  cardBody: "p-6",
  
  // Section Headers
  sectionTitle: "text-base font-semibold text-slate-800 mb-4 flex items-center gap-2",
  
  // --- Typography ---
  h2: "text-2xl font-bold text-slate-900",
  h3: "text-lg font-semibold text-slate-900",
  pSub: "text-sm text-slate-500",
  label: "block text-sm font-medium text-slate-700 mb-1.5",
  value: "text-base font-medium text-slate-900",
  
  // --- Inputs ---
  input: "w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all shadow-sm",
  inputSm: "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all shadow-sm",
  inputVerification: "w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-center text-3xl tracking-[0.3em] font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all shadow-sm h-16",
  
  // --- Buttons Combinations ---
  buttonPrimary: "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 text-base bg-blue-600 hover:bg-blue-700 text-white shadow-sm focus:ring-blue-500",
  buttonSmPrimary: "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-sm focus:ring-blue-500",
  buttonSecondary: "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 text-base bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm focus:ring-slate-500",
  buttonSmSecondary: "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm focus:ring-slate-500",
  buttonInline: "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 border border-transparent",
  buttonDangerSm: "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 border border-transparent",
  
  // --- Alerts & Status ---
  alertBase: "rounded-lg p-4 flex items-start gap-3 text-sm",
  alertError: "bg-red-50 text-red-800 border border-red-200 rounded-lg p-4 flex items-start gap-3 text-sm",
  alertErrorInline: "bg-red-50 text-red-800 border border-red-200 rounded-lg p-3 flex items-start gap-2 text-sm mt-3",
  alertErrorIconBox: "w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0",
  alertInfo: "bg-blue-50 text-blue-800 border border-blue-200 rounded-lg p-4 flex items-start gap-3 text-sm",
  alertSuccess: "bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg p-4 flex items-start gap-3 text-sm",
  alertWarning: "bg-amber-50 text-amber-800 border border-amber-200 rounded-lg p-4 flex items-start gap-3 text-sm",
  
  // --- Badges / Tags ---
  badge: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
  badgeGray: "bg-slate-100 text-slate-800",
  badgeBlue: "bg-blue-100 text-blue-800",
  badgeGreen: "bg-emerald-100 text-emerald-800",
  badgeRed: "bg-red-100 text-red-800",
  
  // --- Step Indicator ---
  stepIconActive: "w-10 h-10 rounded-full flex items-center justify-center bg-blue-600 text-white shadow-sm ring-4 ring-blue-50",
  stepIconInactive: "w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 text-slate-400 border border-slate-200",
  stepIconCompleted: "w-10 h-10 rounded-full flex items-center justify-center bg-emerald-500 text-white shadow-sm",
  
  // --- Data Display ---
  tableContainer: "border border-slate-200 rounded-lg overflow-hidden",
  table: "w-full text-sm text-left",
  th: "bg-slate-50 px-4 py-3 font-medium text-slate-500 border-b border-slate-200",
  td: "px-4 py-3 border-b border-slate-100 text-slate-700",
  tr: "hover:bg-slate-50/50 transition-colors",
  
  // --- Code & Logs ---
  codeBlock: "font-mono text-sm bg-slate-900 text-slate-300 p-4 rounded-lg overflow-x-auto",
  logContainer: "bg-[#0d1117] rounded-lg border border-slate-800 shadow-inner overflow-hidden",
  logContent: "font-mono text-[13px] leading-relaxed max-h-[400px] overflow-y-auto p-4 custom-scrollbar scroll-smooth text-slate-300",
};
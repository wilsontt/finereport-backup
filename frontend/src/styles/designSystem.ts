import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Enterprise IT Management System Design System (Professional, Clean, Minimalist, High Reliability)
export const UI_PRO_MAX = {
  // --- Layout & Structure ---
  appContainer: "min-h-screen bg-slate-100 text-slate-900 font-sans selection:bg-blue-200 selection:text-blue-900 flex flex-col items-center py-12 relative overflow-hidden",
  pageWrapper: "w-full max-w-3xl px-4 sm:px-6 relative z-10",
  
  // Header
  header: "flex flex-col items-center justify-center pb-8 mb-8 text-center",
  headerTitle: "text-4xl font-bold tracking-tight text-slate-900 mt-5 mb-4",
  headerSubtitle: "text-xl text-slate-600",
  
  // Cards / Panels
  card: "bg-white rounded-2xl shadow-sm overflow-hidden relative",
  cardHeader: "px-8 py-8 pb-2 bg-white flex flex-col items-center justify-center text-center",
  cardTitle: "text-xl font-bold text-slate-800 mt-4",
  cardBody: "p-8",
  
  // Section Headers
  sectionTitle: "text-slate-400 text-sm uppercase tracking-widest mb-8 flex items-center gap-2",
  
  // --- Typography ---
  h2: "text-2xl font-bold text-slate-900 tracking-tight",
  h3: "text-lg font-bold text-slate-800 tracking-tight",
  pSub: "text-sm text-slate-500",
  label: "block text-sm font-semibold text-slate-700 mb-2",
  value: "text-base font-medium text-slate-900",
  
  // --- Inputs ---
  input: "w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-300 focus:border-blue-500 focus:ring-[4px] focus:ring-blue-500/15 hover:border-slate-300",
  inputError: "w-full bg-red-50/30 border-2 border-red-300 rounded-xl px-4 py-3 text-base text-slate-900 placeholder:text-red-300 outline-none transition-all duration-300 focus:border-red-500 focus:ring-[4px] focus:ring-red-500/15 hover:border-red-400",
  inputSm: "w-full bg-white border-2 border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-300 focus:border-blue-500 focus:ring-[4px] focus:ring-blue-500/15 hover:border-slate-300",
  inputSmError: "w-full bg-red-50/30 border-2 border-red-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-red-300 outline-none transition-all duration-300 focus:border-red-500 focus:ring-[4px] focus:ring-red-500/15 hover:border-red-400",
  inputVerification: "w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 text-center text-3xl tracking-[0.3em] font-mono font-bold text-slate-900 outline-none transition-all duration-300 focus:border-blue-500 focus:ring-[4px] focus:ring-blue-500/15 h-16 hover:border-slate-300",
  
  errorText: "text-sm font-medium text-red-500 mt-1.5 flex items-center gap-1.5 animate-in slide-in-from-top-1",
  
  // --- Buttons Combinations ---
  buttonPrimary: "btn-ripple inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-transform duration-200 px-6 py-3.5 text-base bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 shadow-sm",
  buttonSmPrimary: "btn-ripple inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-transform duration-200 px-4 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 shadow-sm",
  buttonSecondary: "btn-ripple inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 px-6 py-3.5 text-base bg-slate-100 hover:bg-slate-200 active:bg-slate-300 active:scale-[0.98] text-slate-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
  buttonSmSecondary: "btn-ripple inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 px-4 py-2.5 text-sm bg-slate-100 hover:bg-slate-200 active:bg-slate-300 active:scale-[0.98] text-slate-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
  buttonInline: "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 px-4 py-2.5 text-sm bg-slate-50 hover:bg-slate-100 active:bg-slate-200 active:scale-[0.98] text-slate-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
  buttonDangerSm: "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 px-3 py-2 text-sm bg-red-50 hover:bg-red-100 active:bg-red-200 active:scale-[0.98] text-red-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
  
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
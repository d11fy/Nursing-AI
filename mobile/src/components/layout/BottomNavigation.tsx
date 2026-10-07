import React from "react";
import { LayoutGrid, BookOpen, MessageSquare, BookMarked, User } from "lucide-react";
import { useNavigation } from "../../context/NavigationContext";

export function BottomNavigation() {
  const { activeTab, switchTab } = useNavigation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe shadow-lg">
      <div className="flex h-16 items-center justify-around px-2 max-w-lg mx-auto">
        {/* Home */}
        <button
          onClick={() => switchTab("home")}
          className={`flex min-h-12 flex-1 flex-col items-center justify-center py-1 transition-transform active:scale-95 ${
            activeTab === "home" ? "text-primary font-bold" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <LayoutGrid className={`size-5 transition-transform ${activeTab === "home" ? "scale-110" : ""}`} />
          <span className="text-[11px] mt-1">الرئيسية</span>
        </button>

        {/* Subjects */}
        <button
          onClick={() => switchTab("subjects")}
          className={`flex min-h-12 flex-1 flex-col items-center justify-center py-1 transition-transform active:scale-95 ${
            activeTab === "subjects" ? "text-primary font-bold" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <BookOpen className={`size-5 transition-transform ${activeTab === "subjects" ? "scale-110" : ""}`} />
          <span className="text-[11px] mt-1">المواد</span>
        </button>

        {/* Chat - Prominent Center Button */}
        <div className="-mt-4 flex flex-1 flex-col items-center justify-center">
          <button
            onClick={() => switchTab("chat")}
            className={`flex size-14 items-center justify-center rounded-full border-4 border-white bg-primary text-white shadow-lg shadow-primary/30 transition-transform active:scale-95 dark:border-slate-900 ${activeTab === "chat" ? "ring-2 ring-primary/35 ring-offset-2 ring-offset-white dark:ring-offset-slate-900" : ""}`}
            aria-label="المحادثة مع AI"
          >
            <MessageSquare className="size-6" />
          </button>
          <span className={`mt-0.5 text-[10px] ${activeTab === "chat" ? "font-bold text-primary" : "text-slate-400"}`}>المحادثة</span>
        </div>

        {/* Library */}
        <button
          onClick={() => switchTab("library")}
          className={`flex min-h-12 flex-1 flex-col items-center justify-center py-1 transition-transform active:scale-95 ${
            activeTab === "library" ? "text-primary font-bold" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <BookMarked className={`size-5 transition-transform ${activeTab === "library" ? "scale-110" : ""}`} />
          <span className="text-[11px] mt-1">المكتبة</span>
        </button>

        {/* Profile */}
        <button
          onClick={() => switchTab("profile")}
          className={`flex min-h-12 flex-1 flex-col items-center justify-center py-1 transition-transform active:scale-95 ${
            activeTab === "profile" ? "text-primary font-bold" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <User className={`size-5 transition-transform ${activeTab === "profile" ? "scale-110" : ""}`} />
          <span className="text-[11px] mt-1">حسابي</span>
        </button>
      </div>
    </nav>
  );
}

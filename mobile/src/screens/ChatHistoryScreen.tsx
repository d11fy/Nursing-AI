import React, { useEffect, useState } from "react";
import { History, Search, Trash2, Edit2, MessageSquare, ChevronLeft, RefreshCw, X } from "lucide-react";
import { useNavigation } from "../context/NavigationContext";
import { apiFetch } from "../services/api";
import { BottomSheet } from "../components/common/BottomSheet";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

export function ChatHistoryScreen() {
  const { navigate } = useNavigation();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Rename bottom sheet
  const [editingConv, setEditingConv] = useState<Conversation | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [savingRename, setSavingRename] = useState(false);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/conversations");
      setConversations(res.conversations || []);
    } catch (err) {
      console.warn("Failed loading history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("هل أنت متأكد من حذف هذه المحادثة؟")) return;
    try {
      await apiFetch(`/api/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      alert(err.message || "تعذر حذف المحادثة");
    }
  };

  const handleOpenRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConv(conv);
    setNewTitle(conv.title);
  };

  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConv || !newTitle.trim()) return;
    setSavingRename(true);
    try {
      await apiFetch(`/api/conversations/${editingConv.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === editingConv.id ? { ...c, title: newTitle.trim() } : c))
      );
      setEditingConv(null);
    } catch (err: any) {
      alert(err.message || "تعذر تعديل العنوان");
    } finally {
      setSavingRename(false);
    }
  };

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 pb-nav">
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث في سجل المحادثات..."
          className="w-full h-11 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pl-10 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-hidden"
        />
        <Search className="absolute left-3.5 top-3.5 size-4 text-slate-400" />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-2">
          <RefreshCw className="size-6 text-primary animate-spin" />
          <span className="text-xs text-slate-400">جارٍ تحميل السجل...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center text-xs text-slate-400">
          لا توجد محادثات سابقة مطابقة.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate("chat-detail", { conversationId: c.id })}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs active:scale-98 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 dark:bg-slate-800 text-primary">
                  <MessageSquare className="size-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {c.title}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(c.updated_at).toLocaleDateString("ar-EG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => handleOpenRename(c, e)}
                  className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 active:scale-95"
                  aria-label="تعديل العنوان"
                >
                  <Edit2 className="size-3.5" />
                </button>
                <button
                  onClick={(e) => handleDelete(c.id, e)}
                  className="flex size-8 items-center justify-center rounded-lg text-red-400 hover:text-red-600 active:scale-95"
                  aria-label="حذف"
                >
                  <Trash2 className="size-3.5" />
                </button>
                <ChevronLeft className="size-4 text-slate-400" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rename Bottom Sheet */}
      <BottomSheet
        isOpen={Boolean(editingConv)}
        onClose={() => setEditingConv(null)}
        title="تعديل عنوان المحادثة"
      >
        <form onSubmit={handleSaveRename} className="space-y-4">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
            className="w-full h-11 rounded-xl border border-slate-200 px-3 text-xs"
          />
          <button
            type="submit"
            disabled={savingRename}
            className="w-full h-12 rounded-2xl bg-primary text-white font-bold text-xs active:scale-97 disabled:opacity-60"
          >
            {savingRename ? "جارٍ الحفظ..." : "حفظ التعديل"}
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}

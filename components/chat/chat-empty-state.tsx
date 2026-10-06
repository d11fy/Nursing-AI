import { MessageSquareText } from "lucide-react";

export function ChatEmptyState() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-5 text-center sm:py-6">
      <span className="icon-tile mb-4 size-12">
        <MessageSquareText className="size-5" />
      </span>
      <p className="eyebrow mb-1.5">ابدأ جلسة جديدة</p>
      <h2 className="text-xl font-extrabold text-foreground sm:text-2xl">
        اسألني أي سؤال في التمريض
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        اكتب سؤالك بطريقتك في حقل المحادثة أدناه.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Image from "next/image";
import { ThumbsUp, ThumbsDown, Copy, Check, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FeedbackDialog } from "@/components/chat/feedback-dialog";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand/brand-mark";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string | null;
}

export function MessageBubble({ message, showAITrace=false }: { message: ChatMessageData; showAITrace?:boolean }) {
  const [copied, setCopied] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [trace, setTrace] = useState<Record<string,unknown>|null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const isUser = message.role === "user";

  async function copyAnswer() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function sendFeedback(isPositive: boolean, reason?: string, comment?: string) {
    setFeedback(isPositive ? "up" : "down");
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: message.id, isPositive, reason, comment }),
    });
  }
  async function loadTrace(){
    if(trace){setTraceOpen((value)=>!value);return;}
    const response=await fetch(`/api/admin/ai-traces/${message.id}`);
    if(response.ok){setTrace(await response.json());setTraceOpen(true);}
  }

  return (
    <div className={cn("flex w-full min-w-0 gap-2 sm:gap-3", isUser ? "justify-end" : "justify-start", !isUser && !message.content && !message.imageUrl && "hidden")}>
      {!isUser && (
        <span className="mt-1 shrink-0" aria-label="Nursing AI">
          <BrandMark compact />
        </span>
      )}
      <div
        className={cn(
          "min-w-0 rounded-2xl text-sm leading-7",
          isUser
            ? "max-w-[88%] sm:max-w-[75%]"
            : "flex-1 border border-border bg-card px-4 py-4 shadow-[0_2px_12px_rgb(16_42_58/0.035)] sm:px-5 sm:py-5"
        )}
      >
        {message.imageUrl && (
          <>
            <button type="button" className="mb-2 block max-w-full overflow-hidden rounded-2xl border border-border bg-muted p-1.5 focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setImagePreviewOpen(true)} aria-label="تكبير الصورة المرفقة">
              <Image src={message.imageUrl} alt="مرفق" width={640} height={480} className="h-auto max-h-80 w-auto max-w-full rounded-xl object-contain sm:max-h-96" unoptimized />
            </button>
            <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
              <DialogContent className="sm:max-w-4xl">
                <DialogHeader><DialogTitle>الصورة المرفقة</DialogTitle></DialogHeader>
                <Image src={message.imageUrl} alt="الصورة المرفقة بالحجم الكامل" width={1280} height={960} className="mx-auto h-auto max-h-[75dvh] w-auto max-w-full rounded-xl object-contain" unoptimized />
              </DialogContent>
            </Dialog>
          </>
        )}

        {isUser ? (
          <p dir="auto" className="w-fit whitespace-pre-wrap break-words rounded-2xl rounded-ee-md bg-primary px-4 py-2.5 text-primary-foreground">{message.content}</p>
        ) : (
          <div dir="auto" className="study-prose prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-headings:text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              p: ({ children }) => <p dir="auto">{children}</p>,
              h1: ({ children }) => <h1 dir="auto">{children}</h1>,
              h2: ({ children }) => <h2 dir="auto">{children}</h2>,
              h3: ({ children }) => <h3 dir="auto">{children}</h3>,
              li: ({ children }) => <li dir="auto">{children}</li>,
              blockquote: ({ children }) => <blockquote dir="auto">{children}</blockquote>,
              table: ({ children }) => <div className="study-table" role="region" aria-label="جدول الشرح، قابل للتمرير أفقيًا" tabIndex={0}><table>{children}</table></div>,
            }}>{message.content}</ReactMarkdown>
          </div>
        )}

        {!isUser && message.content && (
          <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-border/70 pt-2 text-muted-foreground">
            <Button variant="ghost" size="icon" className="size-10" onClick={copyAnswer} aria-label="نسخ الإجابة" title="نسخ الإجابة">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-10", feedback === "up" && "bg-success/10 text-success")}
              aria-label="إجابة مفيدة"
              title="إجابة مفيدة"
              onClick={() => sendFeedback(true)}
              disabled={message.id.startsWith('local-')}
            >
              <ThumbsUp className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-10", feedback === "down" && "bg-destructive/10 text-destructive")}
              aria-label="تقييم الإجابة"
              title="تقييم الإجابة"
              onClick={() => setFeedbackOpen(true)}
              disabled={message.id.startsWith('local-')}
            >
              <ThumbsDown className="size-3.5" />
            </Button>
            <FeedbackDialog
              open={feedbackOpen}
              onOpenChange={setFeedbackOpen}
              onSubmit={(reason, comment) => sendFeedback(false, reason, comment)}
            />
            {showAITrace && !message.id.startsWith("local-") && <Button variant="ghost" size="sm" className="mr-auto h-7 gap-1 text-xs" onClick={loadTrace}>
              <Activity className="size-3.5" /> تتبع AI
            </Button>}
          </div>
        )}
        {traceOpen && trace && <pre dir="ltr" className="mt-2 max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-left text-[11px] text-slate-100">{JSON.stringify(trace,null,2)}</pre>}
      </div>
    </div>
  );
}

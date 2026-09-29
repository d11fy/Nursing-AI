"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Image from "next/image";
import { ThumbsUp, ThumbsDown, Copy, Check, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackDialog } from "@/components/chat/feedback-dialog";
import { cn } from "@/lib/utils";

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
    <div className={cn("flex w-full", isUser ? "justify-start" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[75%]",
          isUser
            ? "mr-auto bg-blue-600 text-white"
            : "ml-auto w-full bg-white shadow-sm sm:max-w-[85%] dark:bg-slate-900"
        )}
      >
        {message.imageUrl && (
          <div className="relative mb-2 aspect-video w-full max-w-xs overflow-hidden rounded-lg">
            <Image src={message.imageUrl} alt="مرفق" fill className="object-cover" unoptimized />
          </div>
        )}

        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-headings:text-slate-900 dark:prose-headings:text-white">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}

        {!isUser && message.content && (
          <div className="mt-3 flex items-center gap-1 border-t border-border pt-2">
            <Button variant="ghost" size="icon" className="size-7" onClick={copyAnswer}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-7", feedback === "up" && "text-green-600")}
              onClick={() => sendFeedback(true)}
            >
              <ThumbsUp className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-7", feedback === "down" && "text-red-600")}
              onClick={() => setFeedbackOpen(true)}
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

/** The server closes the response only after saving the assistant message.
 * Do not navigate to a server-rendered conversation before that point. */
export async function consumeChatResponse(
  response: Response,
  callbacks: {
    onConversationId: (id: string) => void;
    onChunk: (text: string) => void;
    onComplete: (id: string | null) => void;
    onMessageIds?: (assistantId:string,userId:string) => void;
  }
) {
  const id = response.headers.get("X-Conversation-Id");
  if (id) callbacks.onConversationId(id);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing chat response body");
  const decoder = new TextDecoder();
  const sse=response.headers.get('Content-Type')?.includes('text/event-stream');
  let buffer='',persisted=false;
  function consume(text:string){
    if(!sse){callbacks.onChunk(text);return;}
    buffer+=text;
    let boundary:number;
    while((boundary=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
      const kind=event.match(/^event: (.+)$/m)?.[1],data=event.match(/^data: (.+)$/m)?.[1];if(!data)continue;
      const payload=JSON.parse(data);
      if(kind==='delta')callbacks.onChunk(payload.text);
      if(kind==='persisted'){persisted=true;callbacks.onMessageIds?.(payload.messageId,payload.userMessageId);}
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) consume(text);
    }
    const remaining = decoder.decode();
    if (remaining) consume(remaining);
  } finally {
    reader.releaseLock();
  }
  if(!sse||persisted)callbacks.onComplete(id);
}

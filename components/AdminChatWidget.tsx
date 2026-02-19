
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { EmployeeProfile } from '../types';
import { Button } from './Button';
import { useChat } from '../hooks/useChat';

export const AdminChatWidget: React.FC<{ 
  currentUser: EmployeeProfile; 
  isOpen: boolean; 
  onClose: () => void;
  onUnreadChange: (hasUnread: boolean) => void;
}> = ({ currentUser, isOpen, onClose, onUnreadChange }) => {
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const previousMsgCount = useRef(0);

  const { messages, sendMessage, isConnected } = useChat({ userId: currentUser.id, isAdmin: true });
  const supportMessages = useMemo(
    () => messages.filter((msg) => msg.type === 'CUSTOMER_SUPPORT' && msg.threadId),
    [messages]
  );
  const threads = useMemo(() => {
    const grouped = new Map<string, typeof supportMessages>();
    supportMessages.forEach((msg) => {
      const key = String(msg.threadId || '').trim();
      if (!key) return;
      const list = grouped.get(key) || [];
      list.push(msg);
      grouped.set(key, list);
    });
    return Array.from(grouped.entries())
      .map(([threadId, list]) => {
        const sorted = [...list].sort((a, b) => a.timestamp - b.timestamp);
        const latest = sorted[sorted.length - 1];
        const customerMsg =
          sorted.find((msg) => msg.role === 'CUSTOMER') ||
          sorted.find((msg) => msg.senderId !== currentUser.id) ||
          latest;
        return {
          threadId,
          title: customerMsg?.senderName || 'Anonymous',
          preview: String(latest?.message || '').slice(0, 80),
          lastAt: latest?.timestamp || 0,
          unreadCount: sorted.filter((msg) => msg.senderId !== currentUser.id).length,
          messages: sorted,
        };
      })
      .sort((a, b) => b.lastAt - a.lastAt);
  }, [supportMessages, currentUser.id]);
  const selectedThread = useMemo(
    () => threads.find((t) => t.threadId === selectedThreadId) || null,
    [threads, selectedThreadId]
  );
  const threadMessages = selectedThread?.messages || [];

  // Initialize selected thread via URL or newest.
  useEffect(() => {
    if (selectedThreadId || !threads.length) return;
    const fromUrl = new URLSearchParams(window.location.search).get('thread');
    const normalizedFromUrl = String(fromUrl || '').trim();
    const initial =
      (normalizedFromUrl && threads.some((t) => t.threadId === normalizedFromUrl) && normalizedFromUrl) ||
      threads[0].threadId;
    setSelectedThreadId(initial);
  }, [threads, selectedThreadId]);

  // Scroll to bottom when opening or selected thread updates.
  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [threadMessages.length, isOpen, selectedThreadId]);

  // Handle Unread Notifications
  useEffect(() => {
    // If we have more messages than before...
    if (supportMessages.length > previousMsgCount.current) {
      const latest = supportMessages[supportMessages.length - 1];
      
      // If widget is CLOSED and message is NOT from me, it's unread
      if (!isOpen && latest.senderId !== currentUser.id) {
        onUnreadChange(true);
      }
    }
    previousMsgCount.current = supportMessages.length;
  }, [supportMessages, isOpen, currentUser.id, onUnreadChange]);

  // Clear unread when opened
  useEffect(() => {
    if (isOpen) {
      onUnreadChange(false);
    }
  }, [isOpen, onUnreadChange]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    const activeThreadId = selectedThreadId || undefined;
    if (!activeThreadId) return;
    await sendMessage(
      newMessage,
      activeThreadId,
      'CUSTOMER_SUPPORT',
      currentUser.name,
      currentUser.role
    );
    setNewMessage('');
  };

  // We use CSS transform instead of returning null to keep the hook/subscription alive
  return (
    <div 
      className={`fixed right-0 top-0 bottom-0 w-full md:w-[46rem] max-w-full bg-[#0a0a0a] border-l border-zinc-800 shadow-2xl z-[60] flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
       <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/50 backdrop-blur-md">
          <div className="flex items-center gap-2">
             <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-[#00e599]' : 'bg-red-500'} animate-pulse`}></div>
             <div><h3 className="font-bold text-white text-sm">Unified Command</h3></div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">✕</button>
       </div>
       <div className="flex-1 min-h-0 flex">
         <div className="w-64 border-r border-zinc-800 overflow-y-auto custom-scrollbar">
           {threads.map((thread) => {
             const active = thread.threadId === selectedThreadId;
             return (
               <button
                 key={thread.threadId}
                 onClick={() => setSelectedThreadId(thread.threadId)}
                 className={`w-full text-left px-3 py-3 border-b border-zinc-800/70 ${active ? 'bg-zinc-800/70' : 'hover:bg-zinc-900/70'}`}
               >
                 <div className="flex items-center justify-between gap-2">
                   <span className="text-xs font-semibold text-white truncate">{thread.title}</span>
                   <span className="text-[10px] text-zinc-400">
                     {new Date(thread.lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </span>
                 </div>
                 <div className="text-[11px] text-zinc-400 truncate mt-1">{thread.preview || 'No messages yet'}</div>
               </button>
             );
           })}
           {!threads.length && <div className="p-4 text-xs text-zinc-500">No support threads yet.</div>}
         </div>
         <div className="flex-1 min-w-0 flex flex-col">
           <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
             {!selectedThread && (
               <div className="text-sm text-zinc-500">Select a thread to view messages.</div>
             )}
             {threadMessages.map((msg, idx) => {
               const isMe = msg.senderId === currentUser.id;
               return (
                 <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                   <div className="flex items-center gap-2 mb-1">
                     <span className="text-xs font-bold text-white">{msg.senderName}</span>
                   </div>
                   <div className={`px-3 py-2 rounded-lg text-sm max-w-[90%] ${isMe ? 'bg-[#00e599]/10 text-white' : 'bg-zinc-800 text-zinc-300'}`}>
                     {msg.message}
                   </div>
                 </div>
               );
             })}
             <div ref={messagesEndRef} />
           </div>
           <div className="bg-zinc-900 border-t border-zinc-800 p-4">
             {selectedThreadId && (
               <div className="text-xs text-emerald-400 mb-2">Replying to thread: {selectedThreadId}</div>
             )}
             <form onSubmit={handleSendMessage} className="flex gap-2">
               <input
                 type="text"
                 value={newMessage}
                 onChange={e => setNewMessage(e.target.value)}
                 disabled={!selectedThreadId}
                 className="flex-1 bg-black border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50"
               />
               <Button type="submit" size="sm" disabled={!selectedThreadId}>Send</Button>
             </form>
           </div>
         </div>
       </div>
    </div>
  );
};

import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { ChatMessage } from '../types';
import { PersistenceService } from '../services/persistence';

interface UseChatProps {
  userId?: string;
  threadId?: string;
  isAdmin?: boolean;
}

export const useChat = ({ userId, threadId, isAdmin = false }: UseChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const normalizeIncomingMessage = (row: any): ChatMessage | null => {
    const payload = row?.data && typeof row.data === 'object' ? row.data : {};
    const id = String(payload.id || row?.id || '').trim();
    const senderId = String(payload.senderId || row?.sender_id || '').trim();
    const message = String(payload.message || row?.message || '').trim();
    if (!id || !senderId || !message) return null;

    const rawTimestamp = payload.timestamp || row?.created_at;
    const timestamp =
      typeof rawTimestamp === 'number'
        ? rawTimestamp
        : new Date(String(rawTimestamp || '')).getTime() || Date.now();

    return {
      id,
      senderId,
      senderName: String(payload.senderName || row?.sender_name || 'User'),
      role: (payload.role || row?.role || 'CUSTOMER') as ChatMessage['role'],
      message,
      timestamp,
      type:
        String(payload.type || row?.type || '').toUpperCase() === 'INTERNAL'
          ? 'INTERNAL'
          : 'CUSTOMER_SUPPORT',
      threadId: String(payload.threadId || row?.thread_id || '').trim() || undefined,
    };
  };

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const allMsgs = await PersistenceService.getChatHistory();
        let filtered = allMsgs;
        if (!isAdmin && threadId) {
          filtered = allMsgs.filter(m => m.threadId === threadId || (!m.threadId && m.type === 'CUSTOMER_SUPPORT'));
        }
        setMessages(filtered.sort((a, b) => a.timestamp - b.timestamp));
      } catch (e) {
        console.error("Failed to load chat history", e);
      }
    };
    if (userId) loadHistory();
  }, [userId, threadId, isAdmin]);

  useEffect(() => {
    if (!userId) return;
    const channelName = isAdmin ? 'admin_global_chat' : `customer_chat_${threadId}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, (payload) => {
        const newMsg = normalizeIncomingMessage(payload.new);
        if (!newMsg) return;

        const isRelevant = isAdmin || newMsg.threadId === threadId;
        if (isRelevant) {
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg].sort((a, b) => a.timestamp - b.timestamp);
          });
        }
      })
      .subscribe((status) => setIsConnected(status === 'SUBSCRIBED'));

    return () => { supabase.removeChannel(channel); };
  }, [userId, threadId, isAdmin]);

  const sendMessage = async (text: string, targetThreadId?: string, type: 'INTERNAL' | 'CUSTOMER_SUPPORT' = 'CUSTOMER_SUPPORT', senderName?: string, senderRole?: any) => {
    const msg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      senderId: userId || 'anon',
      senderName: senderName || 'User',
      role: senderRole || 'CUSTOMER',
      message: text,
      timestamp: Date.now(),
      type: type,
      threadId: targetThreadId || threadId
    };
    setMessages(prev => [...prev, msg]);
    await PersistenceService.addChatMessage(msg);
  };

  return { messages, sendMessage, isConnected };
};

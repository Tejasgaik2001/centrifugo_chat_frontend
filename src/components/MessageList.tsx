import { useState, useEffect, useRef } from 'react';
import { messageAPI, roomAPI } from '../api';
import { ws } from '../websocket';
import { formatDistanceToNow } from 'date-fns';
import './MessageList.css';

interface User {
  _id: string;
  username: string;
  name: string;
}

interface Room {
  _id?: string;
  id?: string;
  rid?: string;
  name?: string;
  type: string;
  usernames?: string[];
}

interface Message {
  _id: string;
  u: { _id: string; username: string };
  msg: string;
  ts: string;
  editedAt?: string;
  readBy?: string[];
}

interface MessageListProps {
  room: Room;
  user: User;
}

export default function MessageList({ room, user }: MessageListProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const roomId = room._id ?? room.id ?? room.rid ?? '';

  useEffect(() => {
    if (!roomId) {
      console.error('Cannot load room: missing room id', room);
      setMessages([]);
      return;
    }

    loadMessages();
    ws.subscribe(roomId);
    
    const handleNewMessage = (data: any) => {
      console.log('[MessageList] New message event received:', data, 'for room:', roomId);
      // Always check if this message is for the current room
      if (data.roomId === roomId) {
        console.log('[MessageList] Adding message to list:', data.message);
        setMessages((prev) => {
          // Check if message already exists to avoid duplicates
          const exists = prev.some(msg => msg._id === data.message._id);
          if (!exists) {
            return [...prev, data.message];
          }
          return prev;
        });
        // Don't mark as read here - RoomList handles it when room is selected
      }
    };

    const handleUpdatedMessage = (data: any) => {
      console.log('[MessageList] Message update event received:', data, 'for room:', roomId);
      if (data.roomId === roomId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === data.message._id ? { ...msg, ...data.message } : msg
          )
        );
      }
    };

    const handleReadReceipt = (data: any) => {
      console.log('[MessageList] Read receipt event received:', data);
      if (data.roomId === roomId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === data.lastReadMessageId
              ? { ...msg, readBy: [...(msg.readBy || []), data.userId] }
              : msg
          )
        );
      }
    };

    const handleDeletedMessage = (data: any) => {
      console.log('[MessageList] Message delete event received:', data, 'for room:', roomId);
      if (data.roomId === roomId) {
        setMessages((prev) =>
          prev.filter((msg) => msg._id !== data.messageId)
        );
      }
    };

    ws.on('message_new', handleNewMessage);
    ws.on('message_updated', handleUpdatedMessage);
    ws.on('message_deleted', handleDeletedMessage);
    ws.on('read_receipt', handleReadReceipt);

    return () => {
      ws.off('message_new', handleNewMessage);
      ws.off('message_updated', handleUpdatedMessage);
      ws.off('message_deleted', handleDeletedMessage);
      ws.off('read_receipt', handleReadReceipt);
      // Don't unsubscribe here - we want to keep receiving messages for all rooms
    };
  }, [room, roomId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    if (!roomId) {
      return;
    }

    setLoading(true);
    try {
      const res = await messageAPI.list(roomId);
      setMessages(res.data.messages);
      await roomAPI.markRead(roomId);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleTyping = () => {
    if (!roomId) {
      return;
    }

    ws.startTyping(roomId);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = globalThis.setTimeout(() => {
      ws.stopTyping(roomId);
    }, 3000);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const trimmedRoomId = roomId.trim();
    if (!trimmedRoomId) {
      console.error('Cannot send message: missing room id', room);
      return;
    }

    const msg = newMessage;
    setNewMessage('');
    ws.stopTyping(trimmedRoomId);

    try {
      await messageAPI.send({
        rid: trimmedRoomId,
        msg,
      });
    } catch (err) {
      console.error('Failed to send message:', err);
      setNewMessage(msg);
    }
  };

  const getRoomName = () => {
    if (room.name) return room.name;
    if (room.type === 'd' && room.usernames) {
      return room.usernames.find(u => u !== user.username) || 'Direct Message';
    }
    return 'Unnamed Room';
  };

  const getAvatarInitial = (value: string) => value.trim().charAt(0).toUpperCase() || 'U';

  return (
    <div className="message-list">
      <div className="message-header">
        <h2>{getRoomName()}</h2>
      </div>

      <div className="messages">
        {loading ? (
          <div className="loading">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="no-messages">No messages yet. Start the conversation!</div>
        ) : (
          messages.map(message => {
            const senderId = message.u?._id ?? '';
            const senderUsername = message.u?.username?.trim() || 'unknown';
            const messageText = message.msg ?? '';
            const messageDate = message.ts ? new Date(message.ts) : new Date();

            return (
              <div
                key={message._id}
                className={`message ${senderId === user._id ? 'own-message' : ''}`}
              >
                <div className="message-avatar">
                  {getAvatarInitial(senderUsername)}
                </div>
                <div className="message-content">
                  <div className="message-header-info">
                    <span className="message-username">{senderUsername}</span>
                    <span className="message-time">
                      {formatDistanceToNow(messageDate, { addSuffix: true })}
                    </span>
                  </div>
                  <div className="message-text">
                    {messageText}
                    {senderId === user._id && (
                      <span className="message-status">
                        {message.readBy && message.readBy.length > 0 ? (
                          <span className="tick-read" title="Read">✓✓</span>
                        ) : (
                          <span className="tick-sent" title="Sent">✓✓</span>
                        )}
                      </span>
                    )}
                  </div>
                  {message.editedAt && (
                    <div className="message-edited">(edited)</div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="message-input" onSubmit={handleSend}>
        <input
          type="text"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => {
            setNewMessage(e.target.value);
            handleTyping();
          }}
          maxLength={10000}
        />
        <button type="submit" disabled={!newMessage.trim() || !roomId}>
          Send
        </button>
      </form>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { messageAPI, roomAPI, userAPI, fileAPI } from '../api';
import { ws } from '../websocket';
import { formatDistanceToNow } from 'date-fns';
import PresenceIndicator from './PresenceIndicator';
import EmojiPicker from './EmojiPicker';
import { presenceCache, type UserPresence } from '../services/presenceCache';
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
  memberIds?: string[];
}

interface Attachment {
  type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

interface PendingAttachment {
  file: File;
  previewUrl: string;
  type: 'image' | 'video' | 'audio' | 'file';
}

interface Mention {
  _id: string;
  username: string;
  type: 'user' | 'here' | 'all';
}

interface Message {
  _id: string;
  u: { _id: string; username: string };
  msg: string;
  ts: string;
  editedAt?: string;
  readBy?: string[];
  attachments?: Attachment[];
  mentions?: Mention[];
  replyTo?: {
    _id: string;
    msg: string;
    u: { _id: string; username: string };
  };
}

interface MessageListProps {
  room: Room;
  user: User;
}

export default function MessageList({ room, user }: MessageListProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [typingUsersInRoom, setTypingUsersInRoom] = useState<Set<string>>(new Set());
  
  const [, forceUpdate] = useState(0); // For triggering re-renders when cache updates
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const roomId = room._id ?? room.id ?? room.rid ?? '';

  useEffect(() => {
    if (!roomId) {
      console.error('Cannot load room: missing room id', room);
      setMessages([]);
      return;
    }

    loadMessages();
    loadUserPresence();
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
        if (data.message.u._id !== user._id) {
          roomAPI.markRead(roomId).catch(err => console.error('Failed to auto-mark as read:', err));
        }
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
        setMessages((prev) => {
          const lastReadIndex = prev.findIndex(msg => msg._id === data.lastReadMessageId);
          if (lastReadIndex === -1) return prev;
          
          // Mark all messages up to and including the last read message as read
          return prev.map((msg, index) => {
            if (index <= lastReadIndex) {
              const readBy = msg.readBy || [];
              if (!readBy.includes(data.userId)) {
                return { ...msg, readBy: [...readBy, data.userId] };
              }
            }
            return msg;
          });
        });
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

    const handlePresenceChange = (data: any) => {
      console.log('[MessageList] Presence change event received:', data);
      if (data.type === 'presence_change') {
        presenceCache.set(data.userId, {
          userId: data.userId,
          username: data.username,
          status: data.status,
          lastSeen: data.timestamp
        });
        forceUpdate(prev => prev + 1); // Trigger re-render
      }
    };

    const handleTypingStart = (data: any) => {
      if (data.roomId === roomId && data.username !== user.username) {
        setTypingUsersInRoom(prev => {
          const next = new Set(prev);
          next.add(data.username);
          return next;
        });
      }
    };

    const handleTypingStop = (data: any) => {
      if (data.roomId === roomId) {
        setTypingUsersInRoom(prev => {
          const next = new Set(prev);
          next.delete(data.username);
          return next;
        });
      }
    };

    ws.on('message_new', handleNewMessage);
    ws.on('message_updated', handleUpdatedMessage);
    ws.on('message_deleted', handleDeletedMessage);
    ws.on('read_receipt', handleReadReceipt);
    ws.on('presence_change', handlePresenceChange);
    ws.on('typing_start', handleTypingStart);
    ws.on('typing_stop', handleTypingStop);

    return () => {
      ws.off('message_new', handleNewMessage);
      ws.off('message_updated', handleUpdatedMessage);
      ws.off('message_deleted', handleDeletedMessage);
      ws.off('read_receipt', handleReadReceipt);
      ws.off('presence_change', handlePresenceChange);
      ws.off('typing_start', handleTypingStart);
      ws.off('typing_stop', handleTypingStop);
      // Don't unsubscribe here - we want to keep receiving messages for all rooms
    };
  }, [room, roomId]);

  const loadUserPresence = async () => {
    try {
      const res = await userAPI.getPresence();
      console.log('[MessageList] Loaded user presence:', res.data);
      presenceCache.setMultiple(res.data.users);
      console.log('[MessageList] Presence cache updated:', presenceCache.getAll());
      forceUpdate(prev => prev + 1); // Trigger re-render
    } catch (err) {
      console.error('Failed to load user presence:', err);
    }
  };

  const getUserPresence = (username: string): UserPresence | null => {
    const presence = presenceCache.getByUsername(username);
    console.log('[MessageList] Getting presence for username:', username, 'found:', presence?.status);
    return presence;
  };

  const getUserPresenceByUserId = (userId: string | null): UserPresence | null => {
    if (!userId) return null;
    const presence = presenceCache.get(userId);
    console.log('[MessageList] Getting presence for userId:', userId, 'found:', presence?.status);
    return presence;
  };

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
      await loadUserPresence();
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

    setUploading(true);
    try {
      // 1. Upload all pending attachments
      const uploadedAttachments: Attachment[] = [];
      for (const pending of attachments) {
        const res = await fileAPI.upload(pending.file);
        uploadedAttachments.push(res.data);
      }

      // 2. Send the message
      const msg = newMessage;
      setNewMessage('');
      ws.stopTyping(trimmedRoomId);

      await messageAPI.send({
        rid: trimmedRoomId,
        msg,
        replyTo: replyTo ? { _id: replyTo._id, msg: replyTo.msg, u: replyTo.u } : undefined,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
      });

      // 3. Clear state
      setReplyTo(null);
      // Revoke blob URLs
      attachments.forEach(a => URL.revokeObjectURL(a.previewUrl));
      setAttachments([]);
    } catch (err) {
      console.error('Failed to send message:', err);
      alert('Failed to send message. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      alert('File too large (max 50MB)');
      return;
    }

    const type = file.type.startsWith('image/') ? 'image' : 
                 file.type.startsWith('video/') ? 'video' : 'file';
    
    const previewUrl = URL.createObjectURL(file);
    
    setAttachments(prev => [...prev, {
      file,
      previewUrl,
      type: type as any
    }]);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const item = prev[index];
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleInputChange = (val: string) => {
    setNewMessage(val);
    handleTyping();

    // Mention detection
    const lastAtPos = val.lastIndexOf('@');
    if (lastAtPos !== -1 && (lastAtPos === 0 || val[lastAtPos - 1] === ' ')) {
      const query = val.substring(lastAtPos + 1).split(' ')[0];
      setShowMentionAutocomplete(true);
      
      // Filter room members or global search
      if (query.length >= 1) {
        userAPI.search(query).then(res => setMentionResults(res.data.users));
      } else {
        setMentionResults([]);
      }
    } else {
      setShowMentionAutocomplete(false);
    }
  };

  const insertMention = (username: string) => {
    const lastAtPos = newMessage.lastIndexOf('@');
    const before = newMessage.substring(0, lastAtPos);
    const after = newMessage.substring(newMessage.indexOf(' ', lastAtPos) === -1 ? newMessage.length : newMessage.indexOf(' ', lastAtPos));
    setNewMessage(`${before}@${username} ${after}`);
    setShowMentionAutocomplete(false);
  };

  const getRoomName = () => {
    if (room.name) return room.name;
    if (room.type === 'd' && room.usernames) {
      return room.usernames.find(u => u !== user.username) || 'Direct Message';
    }
    return 'Unnamed Room';
  };

  const getOtherUsername = () => {
    if (room.type === 'd' && room.usernames) {
      const myUsername = user.username.toLowerCase().trim();
      return room.usernames.find(u => u.toLowerCase().trim() !== myUsername) || null;
    }
    return null;
  };

  const getOtherUserId = () => {
    // 0. Try from room.memberIds first - most reliable
    if (room.memberIds && Array.isArray(room.memberIds)) {
      const otherId = room.memberIds.find(id => id !== user._id);
      if (otherId) return otherId;
    }

    const otherUsername = getOtherUsername();
    if (!otherUsername) return null;
    
    // 1. Try from presence cache
    const presence = getUserPresence(otherUsername);
    if (presence?.userId) return presence.userId;
    
    // 2. Try to find in messages if presence cache is incomplete
    const otherMessage = messages.find(m => m.u.username === otherUsername);
    if (otherMessage?.u._id) return otherMessage.u._id;
    
    return null;
  };

  const getAvatarInitial = (value: string) => value.trim().charAt(0).toUpperCase() || 'U';

  return (
    <div className="message-list">
      <div className="message-header">
        <div className="message-header-content">
          <h2>{getRoomName()}</h2>
          {room.type === 'd' && getOtherUsername() && (
            <div className="header-user-info">
              <div className="header-presence">
                <PresenceIndicator 
                  status={getUserPresenceByUserId(getOtherUserId())?.status || getUserPresence(getOtherUsername()!)?.status || 'offline'} 
                  size="small" 
                />
                <span className="header-presence-text">
                  {getUserPresenceByUserId(getOtherUserId())?.status || getUserPresence(getOtherUsername()!)?.status || 'offline'}
                </span>
                <span className="header-user-ids">
                  <span className="id-label">You:</span> {user._id}
                  {getOtherUserId() && (
                    <>
                      <span className="id-separator">|</span>
                      <span className="id-label">Other:</span> {getOtherUserId()}
                    </>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
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
                onMouseEnter={() => {}} // Could show hover actions
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
                    <button 
                      className="reply-btn-inline"
                      onClick={() => setReplyTo(message)}
                      title="Reply"
                    >
                      ↩
                    </button>
                  </div>
                  
                  {message.replyTo && (
                    <div className="reply-preview-bubble" onClick={(e) => {
                      e.stopPropagation();
                      const element = document.getElementById(message.replyTo!._id);
                      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      element?.classList.add('highlight-message');
                      setTimeout(() => element?.classList.remove('highlight-message'), 2000);
                    }}>
                      <div className="reply-user">{message.replyTo.u.username}</div>
                      <div className="reply-msg">{message.replyTo.msg}</div>
                    </div>
                  )}

                  <div className="message-text" id={message._id}>
                    {messageText}
                    {senderId === user._id && (
                      <span className="message-status">
                        {message.readBy && message.readBy.length > 0 ? (
                          <span className="tick-read" title="Read">✓✓</span>
                        ) : (
                          <span className="tick-sent" title="Sent">✓</span>
                        )}
                      </span>
                    )}
                  </div>

                  {message.attachments && message.attachments.length > 0 && (
                    <div className="message-attachments">
                      {message.attachments.map((att, idx) => (
                        <div key={idx} className="attachment-item">
                          {att.type === 'image' ? (
                            <img src={`http://localhost:3000${att.url}`} alt={att.name} loading="lazy" />
                          ) : att.type === 'video' ? (
                            <video src={`http://localhost:3000${att.url}`} controls />
                          ) : (
                            <a href={`http://localhost:3000${att.url}`} target="_blank" rel="noreferrer">
                              📄 {att.name}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

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

      <div className="composer-area">
        {typingUsersInRoom.size > 0 && (
          <div className="typing-indicator-bar">
            {Array.from(typingUsersInRoom).join(', ')} {typingUsersInRoom.size > 1 ? 'are' : 'is'} typing...
          </div>
        )}
        {replyTo && (
          <div className="reply-bar">
            <div className="reply-bar-content">
              <span className="reply-label">Replying to @{replyTo.u.username}</span>
              <span className="reply-text">{replyTo.msg}</span>
            </div>
            <button className="close-reply" onClick={() => setReplyTo(null)}>×</button>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="attachment-previews">
            {attachments.map((att, idx) => (
              <div key={idx} className="preview-item">
                {att.type === 'image' ? (
                  <img src={att.previewUrl} alt="preview" className="composer-preview-img" />
                ) : (
                  <span className="preview-name">{att.file.name}</span>
                )}
                <button 
                  type="button"
                  className="remove-preview" 
                  onClick={() => removeAttachment(idx)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {showMentionAutocomplete && mentionResults.length > 0 && (
          <div className="mention-autocomplete">
            {mentionResults.map(m => (
              <div key={m._id} className="mention-item" onClick={() => insertMention(m.username)}>
                @{m.username} ({m.name})
              </div>
            ))}
          </div>
        )}

        <form className="message-input" onSubmit={handleSend}>
          <button
            type="button"
            className="attachment-button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach file"
            disabled={uploading}
          >
            {uploading ? '⌛' : '📎'}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
            accept="image/*,video/*"
          />
          <button
            type="button"
            className="emoji-button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="Add emoji"
          >
            😊
          </button>
          <input
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => handleInputChange(e.target.value)}
            maxLength={10000}
          />
          <button type="submit" disabled={(!newMessage.trim() && attachments.length === 0) || !roomId || uploading}>
            Send
          </button>
        </form>
      </div>

      {showEmojiPicker && (
        <EmojiPicker
          onEmojiSelect={(emoji) => {
            setNewMessage(prev => prev + emoji);
            setShowEmojiPicker(false);
          }}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}
    </div>
  );
}

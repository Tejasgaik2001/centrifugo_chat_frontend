import { useState, useEffect } from 'react';
import { roomAPI, userAPI } from '../api';
import { ws } from '../websocket';
import PresenceIndicator from './PresenceIndicator';
import GroupCreation from './GroupCreation';
import { presenceCache } from '../services/presenceCache';
import './RoomList.css';

interface Room {
  _id?: string;
  id?: string;
  roomId?: string;
  name?: string;
  type: string;
  unread?: number;
  usernames?: string[];
  memberIds?: string[];
  lastMessage?: {
    id: string;
    msg: string;
    ts: string;
    u: { _id: string; username: string };
  };
}


interface RoomListProps {
  user: {
    _id: string;
    username: string;
  };
  selectedRoom: Room | null;
  onSelectRoom: (room: Room) => void;
}

export default function RoomList({ user, selectedRoom, onSelectRoom }: RoomListProps) {
  const username = user.username;
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showGroupCreation, setShowGroupCreation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, Set<string>>>({});
  const [, forceUpdate] = useState(0);

  const getRoomId = (room: Room | null | undefined) => room?._id ?? room?.id ?? room?.roomId ?? '';

  useEffect(() => {
    loadRooms();
    loadUserPresence();

    // Listen for new messages to update unread counters and refresh room list
    const handleNewMessage = (data: any) => {
      console.log('[RoomList] New message event received:', data);
      const roomId = data?.roomId;
      
      // Skip if no roomId in the event
      if (roomId === undefined || roomId === null || roomId === '') {
        return;
      }

      // Check if this room is currently selected and visible
      const selectedRoomId = getRoomId(selectedRoom);
      console.log('[RoomList] Comparing roomId:', roomId, 'with selectedRoomId:', selectedRoomId);
      console.log('[RoomList] selectedRoom:', selectedRoom);
      
      // Update room with latest message and reorder
      setRooms((prevRooms) => {
        const updatedRooms = prevRooms.map((room) => {
          const currentRoomId = getRoomId(room);
          if (currentRoomId === roomId) {
            const currentUnread = room.unread ?? 0;
            const newUnread = (!selectedRoom || roomId !== selectedRoomId) ? currentUnread + 1 : currentUnread;
            
            // Update with latest message info
            return {
              ...room,
              unread: newUnread,
              lastMessage: {
                id: data.message._id,
                msg: data.message.msg,
                ts: data.message.ts,
                u: data.message.u,
              }
            };
          }
          return room;
        });
        
        // Reorder rooms: move the room with new message to the top
        const roomIndex = updatedRooms.findIndex(r => getRoomId(r) === roomId);
        if (roomIndex > 0) {
          const [movedRoom] = updatedRooms.splice(roomIndex, 1);
          return [movedRoom, ...updatedRooms];
        }
        
        return updatedRooms;
      });
    };

    // Listen for presence changes
    const handlePresenceChange = (data: any) => {
      console.log('[RoomList] Presence change event received:', data);
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

    const handleRoomCreated = (data: any) => {
      console.log('[RoomList] Room created event received:', data);
      
      // If we are a member of this new room, reload
      if (data.memberIds && data.memberIds.includes(user._id)) {
          console.log('[RoomList] New room involves current user, reloading...');
          loadRooms();
      }
    };

    const handleTypingStart = (data: any) => {
      if (data.username === user.username) return;
      setTypingUsers(prev => {
        const roomTyping = new Set(prev[data.roomId] || []);
        roomTyping.add(data.username);
        return { ...prev, [data.roomId]: roomTyping };
      });
    };

    const handleTypingStop = (data: any) => {
      setTypingUsers(prev => {
        const roomTyping = new Set(prev[data.roomId] || []);
        roomTyping.delete(data.username);
        return { ...prev, [data.roomId]: roomTyping };
      });
    };

    ws.on('message_new', handleNewMessage);
    ws.on('presence_change', handlePresenceChange);
    ws.on('room_created', handleRoomCreated);
    ws.on('typing_start', handleTypingStart);
    ws.on('typing_stop', handleTypingStop);

    return () => {
      ws.off('message_new', handleNewMessage);
      ws.off('presence_change', handlePresenceChange);
      ws.off('room_created', handleRoomCreated);
      ws.off('typing_start', handleTypingStart);
      ws.off('typing_stop', handleTypingStop);
    };
  }, [selectedRoom]);

  const loadRooms = async () => {
    try {
      const res = await roomAPI.list();
      const normalizedRooms = res.data.rooms.map((room: Room) => ({ ...room, _id: getRoomId(room) }));
      setRooms(normalizedRooms);
    } catch (err) {
      console.error('Failed to load rooms:', err);
    }
  };

  const loadUserPresence = async () => {
    try {
      const res = await userAPI.getPresence();
      presenceCache.setMultiple(res.data.users);
      forceUpdate(prev => prev + 1); // Trigger re-render
    } catch (err) {
      console.error('Failed to load user presence:', err);
    }
  };

  const getUserPresence = (username: string) => {
    return presenceCache.getByUsername(username);
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await userAPI.search(query);
      setSearchResults(res.data.users);
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  const startDM = async (username: string) => {
    try {
      const res = await roomAPI.getDM(username);
      const room = res.data.room as Room;
      const roomId = getRoomId(room);
      if (!roomId) {
        console.error('Failed to start DM: missing room id', room);
        return;
      }

      const normalizedRoom: Room = { ...room, _id: roomId };
      setShowNewChat(false);
      setSearchQuery('');
      setSearchResults([]);
      
      if (!rooms.some((r) => getRoomId(r) === roomId)) {
        setRooms([normalizedRoom, ...rooms]);
      }
      
      onSelectRoom(normalizedRoom);
    } catch (err) {
      console.error('Failed to start DM:', err);
    }
  };

  const getRoomName = (room: Room) => {
    if (room.name) return room.name;
    if (room.type === 'd' && room.usernames) {
      return room.usernames.find((u) => u !== username) || 'Direct Message';
    }
    return 'Unnamed Room';
  };

  const getAvatarInitial = (value: string) => value.trim().charAt(0).toUpperCase() || 'U';

  const handleGroupCreated = (room: Room) => {
    const roomId = getRoomId(room);
    if (roomId) {
      const normalizedRoom: Room = { ...room, _id: roomId };
      setRooms([normalizedRoom, ...rooms]);
      onSelectRoom(normalizedRoom);
    }
  };

  return (
    <div className="room-list">
      <div className="room-list-header">
        <h3>Conversations</h3>
        <div className="header-actions">
          <button 
            onClick={() => setShowGroupCreation(true)} 
            className="create-group-btn"
            title="Create Group"
          >
            👥
          </button>
          <button onClick={() => setShowNewChat(!showNewChat)} className="new-chat-btn">
            +
          </button>
        </div>
      </div>

      {showNewChat && (
        <div className="new-chat-search">
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            autoFocus
          />
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map(user => {
                const resultName = user.name?.trim() || user.username?.trim() || 'User';
                const resultUsername = user.username?.trim() || 'unknown';
                const presence = getUserPresence(resultUsername);

                return (
                  <div
                    key={user._id}
                    className="search-result-item"
                    onClick={() => startDM(resultUsername)}
                  >
                    <div className="user-avatar-small">
                      {getAvatarInitial(resultName)}
                    </div>
                    <div className="search-user-info">
                      <div className="result-name">{resultName}</div>
                      <div className="result-username">@{resultUsername}</div>
                      <div className="user-presence">
                        <PresenceIndicator status={presence?.status || 'offline'} size="small" />
                        <span className="presence-text">
                          {presence?.status || 'offline'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="rooms">
        {rooms.map(room => {
          const roomId = getRoomId(room);
          const roomName = getRoomName(room);
          
          // For DM rooms, get the other user's presence
          const isDM = room.type === 'd';
          const otherUsername = isDM && room.usernames && Array.isArray(room.usernames)
            ? room.usernames.find((u) => u.toLowerCase().trim() !== username.toLowerCase().trim()) 
            : null;
          const otherUserId = isDM && room.memberIds && Array.isArray(room.memberIds)
            ? room.memberIds.find((id) => id !== user._id)
            : null;
            
          const userPresence = otherUserId 
            ? presenceCache.get(otherUserId) 
            : (otherUsername ? getUserPresence(otherUsername) : null);

          return (
            <div
              key={roomId || roomName}
              className={`room-item ${getRoomId(selectedRoom) === roomId ? 'active' : ''}`}
              onClick={async () => {
                if (!roomId) {
                  console.error('Cannot select room: missing room id', room);
                  return;
                }
                
                // Clear unread immediately when clicking
                if (room.unread && room.unread > 0) {
                  console.log('[RoomList] Clearing unread on click for room:', roomId);
                  setRooms((prev) =>
                    prev.map((r) =>
                      getRoomId(r) === roomId ? { ...r, unread: 0 } : r
                    )
                  );
                  // Mark as read on backend
                  roomAPI.markRead(roomId).catch(console.error);
                }
                
                onSelectRoom({ ...room, _id: roomId });
              }}
            >
              <div className="room-avatar">
                {getAvatarInitial(roomName)}
              </div>
                <div className="room-info">
                <div className="room-header-row">
                  <div className="room-name">{roomName}</div>
                  {room.lastMessage && room.lastMessage.ts && (
                    <div className="last-message-time">
                      {new Date(room.lastMessage.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
                {typingUsers[roomId] && typingUsers[roomId].size > 0 ? (
                  <div className="last-message typing-indicator-text">
                    {Array.from(typingUsers[roomId]).join(', ')} {typingUsers[roomId].size > 1 ? 'are' : 'is'} typing...
                  </div>
                ) : room.lastMessage ? (
                  <div className="last-message">
                    <span className="last-message-sender">{room.lastMessage.u.username}: </span>
                    <span className="last-message-text">{room.lastMessage.msg || 'Sent an attachment'}</span>
                  </div>
                ) : (
                  <div className="last-message empty-room-msg">No messages yet</div>
                )}
                {isDM && userPresence && (
                  <div className="room-presence">
                    <PresenceIndicator status={userPresence.status} size="small" />
                    <span className="presence-text">
                      {userPresence.status}
                    </span>
                  </div>
                )}
                {(room?.unread ?? 0) > 0 && (
                  <div className="unread-badge">{room.unread}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showGroupCreation && (
        <GroupCreation
          onClose={() => setShowGroupCreation(false)}
          onGroupCreated={handleGroupCreated}
        />
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { roomAPI, userAPI } from '../api';
import { ws } from '../websocket';
import PresenceIndicator from './PresenceIndicator';
import './RoomList.css';

interface Room {
  _id?: string;
  id?: string;
  rid?: string;
  name?: string;
  type: string;
  unread?: number;
  usernames?: string[];
}

interface UserPresence {
  userId: string;
  username: string;
  status: 'online' | 'offline' | 'away' | 'dnd';
  lastSeen: string;
}

interface RoomListProps {
  username: string;
  selectedRoom: Room | null;
  onSelectRoom: (room: Room) => void;
}

export default function RoomList({ username, selectedRoom, onSelectRoom }: RoomListProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [userPresence, setUserPresence] = useState<Record<string, UserPresence>>({});

  const getRoomId = (room: Room | null | undefined) => room?._id ?? room?.id ?? room?.rid ?? '';

  useEffect(() => {
    loadRooms();
    loadUserPresence();

    // Listen for new messages to update unread counters
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
      
      // Only increment if the message is NOT for the currently selected room
      // AND there is actually a room selected
      if (!selectedRoom || roomId !== selectedRoomId) {
        console.log('[RoomList] Incrementing unread for room:', roomId, 'selectedRoom:', selectedRoom);
        setRooms((prevRooms) =>
          prevRooms.map((room) => {
            const currentRoomId = getRoomId(room);
            if (currentRoomId === roomId) {
              const currentUnread = room.unread ?? 0;
              console.log('[RoomList] Current unread:', currentUnread, 'New unread:', currentUnread + 1);
              return { ...room, unread: currentUnread + 1 };
            }
            return room;
          })
        );
      } else {
        console.log('[RoomList] Message is for selected room, not incrementing unread');
      }
    };

    // Listen for presence changes
    const handlePresenceChange = (data: any) => {
      console.log('[RoomList] Presence change event received:', data);
      if (data.type === 'presence_change') {
        setUserPresence(prev => ({
          ...prev,
          [data.userId]: {
            userId: data.userId,
            username: data.username,
            status: data.status,
            lastSeen: data.timestamp
          }
        }));
      }
    };

    ws.on('message_new', handleNewMessage);
    ws.on('presence_change', handlePresenceChange);

    return () => {
      ws.off('message_new', handleNewMessage);
      ws.off('presence_change', handlePresenceChange);
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
      const presenceMap: Record<string, UserPresence> = {};
      res.data.users.forEach((user: UserPresence) => {
        presenceMap[user.userId] = user;
      });
      setUserPresence(presenceMap);
    } catch (err) {
      console.error('Failed to load user presence:', err);
    }
  };

  const getUserPresence = (username: string): UserPresence | null => {
    const user = Object.values(userPresence).find(p => p.username === username);
    return user || null;
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

  return (
    <div className="room-list">
      <div className="room-list-header">
        <h3>Conversations</h3>
        <button onClick={() => setShowNewChat(!showNewChat)} className="new-chat-btn">
          +
        </button>
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
          const otherUsername = isDM && room.usernames 
            ? room.usernames.find((u) => u !== username) 
            : null;
          const userPresence = otherUsername ? getUserPresence(otherUsername) : null;

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
                <div className="room-name">{roomName}</div>
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
    </div>
  );
}

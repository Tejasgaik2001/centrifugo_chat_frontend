import { useEffect, useState } from 'react';
import RoomList from './RoomList';
import MessageList from './MessageList';
import { authAPI } from '../api';
import './Chat.css';

interface User {
  _id: string;
  username: string;
  name: string;
  email: string;
}

interface Room {
  _id?: string;
  id?: string;
  rid?: string;
  name?: string;
  type: string;
  unread?: number;
  usernames?: string[];
}

interface ChatProps {
  user: User;
  onLogout: () => void;
}

export default function Chat({ user, onLogout }: ChatProps) {
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const displayName = user.name?.trim() || user.username?.trim() || 'User';
  const displayUsername = user.username?.trim() || 'unknown';
  const avatarInitial = displayName.charAt(0).toUpperCase() || 'U';
  const storageKey = `selectedRoom:${user._id}`;

  useEffect(() => {
    const savedRoom = localStorage.getItem(storageKey);
    if (!savedRoom) {
      return;
    }

    try {
      const parsedRoom = JSON.parse(savedRoom) as Room;
      const roomId = parsedRoom._id ?? parsedRoom.id ?? parsedRoom.rid ?? '';
      if (roomId) {
        setSelectedRoom({ ...parsedRoom, _id: roomId });
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  const handleSelectRoom = (room: Room) => {
    const roomId = room._id ?? room.id ?? room.rid ?? '';
    if (!roomId) {
      return;
    }

    const normalizedRoom = { ...room, _id: roomId };
    setSelectedRoom(normalizedRoom);
    localStorage.setItem(storageKey, JSON.stringify(normalizedRoom));
  };

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
    localStorage.removeItem(storageKey);
    onLogout();
  };

  return (
    <div className="chat-container">
      <div className="chat-sidebar">
        <div className="sidebar-header">
          <div className="user-info">
            <div className="user-avatar">{avatarInitial}</div>
            <div>
              <div className="user-name">{displayName}</div>
              <div className="user-username">@{displayUsername}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </div>
        
        <RoomList
          username={user.username}
          selectedRoom={selectedRoom}
          onSelectRoom={handleSelectRoom}
        />
      </div>
      
      <div className="chat-main">
        {selectedRoom ? (
          <MessageList
            room={selectedRoom}
            user={user}
          />
        ) : (
          <div className="no-room-selected">
            <h2>Welcome to Messaging App</h2>
            <p>Select a room or start a new conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}

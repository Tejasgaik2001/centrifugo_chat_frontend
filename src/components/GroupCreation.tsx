import { useState } from 'react';
import { roomAPI, userAPI } from '../api';
import './GroupCreation.css';

interface User {
  _id: string;
  username: string;
  name: string;
}

interface GroupCreationProps {
  onClose: () => void;
  onGroupCreated: (room: any) => void;
}

export default function GroupCreation({ onClose, onGroupCreated }: GroupCreationProps) {
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const toggleUserSelection = (user: User) => {
    if (selectedUsers.find(u => u._id === user._id)) {
      setSelectedUsers(selectedUsers.filter(u => u._id !== user._id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!groupName.trim()) {
      setError('Please enter a group name');
      return;
    }

    if (selectedUsers.length === 0) {
      setError('Please select at least one member');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const memberIds = selectedUsers.map(u => u._id);
      const res = await roomAPI.create({
        type: 'c',
        name: groupName.trim(),
        memberIds
      });
      
      onGroupCreated(res.data.room);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  const getAvatarInitial = (name: string) => name.trim().charAt(0).toUpperCase() || 'U';

  return (
    <>
      <div className="group-creation-overlay" onClick={onClose} />
      <div className="group-creation-modal">
        <div className="group-creation-header">
          <h2>Create Group</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleCreateGroup} className="group-creation-form">
          <div className="form-group">
            <label htmlFor="groupName">Group Name</label>
            <input
              id="groupName"
              type="text"
              placeholder="Enter group name..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={64}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="memberSearch">Add Members</label>
            <input
              id="memberSearch"
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>

          {selectedUsers.length > 0 && (
            <div className="selected-users">
              <h3>Selected Members ({selectedUsers.length})</h3>
              <div className="selected-users-list">
                {selectedUsers.map(user => (
                  <div key={user._id} className="selected-user-chip">
                    <div className="user-chip-avatar">
                      {getAvatarInitial(user.name || user.username)}
                    </div>
                    <span className="user-chip-name">{user.name || user.username}</span>
                    <button
                      type="button"
                      className="remove-user-btn"
                      onClick={() => toggleUserSelection(user)}
                      title="Remove user"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="search-results">
              <h3>Search Results</h3>
              <div className="search-results-list">
                {searchResults.map(user => {
                  const isSelected = selectedUsers.find(u => u._id === user._id);
                  return (
                    <div
                      key={user._id}
                      className={`search-result-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleUserSelection(user)}
                    >
                      <div className="user-avatar-small">
                        {getAvatarInitial(user.name || user.username)}
                      </div>
                      <div className="user-info">
                        <div className="user-name">{user.name || user.username}</div>
                        <div className="user-username">@{user.username}</div>
                      </div>
                      {isSelected && <div className="selected-check">✓</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button type="button" onClick={onClose} className="cancel-btn">
              Cancel
            </button>
            <button 
              type="submit" 
              className="create-btn" 
              disabled={loading || !groupName.trim() || selectedUsers.length === 0}
            >
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

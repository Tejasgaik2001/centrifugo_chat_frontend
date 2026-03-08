import React from 'react';
import './PresenceIndicator.css';

interface PresenceIndicatorProps {
  readonly status: 'online' | 'offline' | 'away' | 'dnd';
  readonly size?: 'small' | 'medium' | 'large';
  readonly showLabel?: boolean;
}

export default function PresenceIndicator({ 
  status, 
  size = 'medium', 
  showLabel = false 
}: PresenceIndicatorProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'online':
        return '#48bb78'; // green
      case 'away':
        return '#ed8936'; // orange
      case 'dnd':
        return '#f56565'; // red
      case 'offline':
      default:
        return '#a0aec0'; // gray
    }
  };

  const getSize = () => {
    switch (size) {
      case 'small':
        return 8;
      case 'large':
        return 16;
      case 'medium':
      default:
        return 12;
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'away':
        return 'Away';
      case 'dnd':
        return 'Do Not Disturb';
      case 'offline':
      default:
        return 'Offline';
    }
  };

  return (
    <div className={`presence-indicator presence-indicator--${size}`}>
      <div
        className="presence-indicator__dot"
        style={{
          backgroundColor: getStatusColor(),
          width: getSize(),
          height: getSize(),
        }}
        title={getStatusLabel()}
      />
      {showLabel && (
        <span className="presence-indicator__label">
          {getStatusLabel()}
        </span>
      )}
    </div>
  );
}

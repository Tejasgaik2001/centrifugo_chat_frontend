import { useState, useEffect } from 'react';
import { ws } from '../websocket';
import './ConnectionBanner.css';

export default function ConnectionBanner() {
  const [isConnected, setIsConnected] = useState(true);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handleConnected = () => {
      console.log('[ConnectionBanner] Connected event received');
      setIsConnected(true);
      // Wait a bit before hiding to show "Back online" message
      globalThis.setTimeout(() => setShow(false), 3000);
    };

    const handleDisconnected = () => {
      console.log('[ConnectionBanner] Disconnected event received');
      setIsConnected(false);
      setShow(true);
    };

    ws.on('connected', handleConnected);
    ws.on('disconnected', handleDisconnected);

    return () => {
      ws.off('connected', handleConnected);
      ws.off('disconnected', handleDisconnected);
    };
  }, []);

  if (!show) return null;

  return (
    <div className={`connection-banner ${isConnected ? 'online' : 'offline'}`}>
      <div className="banner-content">
        <div className={`status-dot ${isConnected ? 'online' : 'offline'}`} />
        <span>
          {isConnected 
            ? 'Connection restored. Welcome back!' 
            : 'You are currently offline. Trying to reconnect...'}
        </span>
      </div>
    </div>
  );
}

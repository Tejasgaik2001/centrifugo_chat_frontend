import { useState, useEffect } from 'react';
import { ws } from '../websocket';
import './WebSocketDebugPanel.css';

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'sent' | 'received' | 'status';
  event: string;
  data: any;
}

export default function WebSocketDebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [maxLogs] = useState(100);

  useEffect(() => {
    // Monitor connection status
    const checkConnection = () => {
      // Check if WebSocket client is connected
      const status = (ws as any).client?.state === 'connected' ? 'connected' : 'disconnected';
      setConnectionStatus(status);
    };

    checkConnection();
    const interval = setInterval(checkConnection, 1000);

    // Log received messages
    const eventTypes = [
      'message_new',
      'message_updated',
      'message_deleted',
      'read_receipt',
      'typing_start',
      'typing_stop',
      'presence_change',
      'room_created',
      'auth_ok',
      'error'
    ];

    const handlers: Array<{ event: string; handler: (data: any) => void }> = [];

    eventTypes.forEach(eventType => {
      const handler = (data: any) => {
        addLog('received', eventType, data);
      };
      handlers.push({ event: eventType, handler });
      ws.on(eventType, handler);
    });

    return () => {
      clearInterval(interval);
      handlers.forEach(({ event, handler }) => {
        ws.off(event, handler);
      });
    };
  }, []);

  const addLog = (type: 'sent' | 'received' | 'status', event: string, data: any) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      type,
      event,
      data
    };

    setLogs(prev => {
      const newLogs = [entry, ...prev];
      return newLogs.slice(0, maxLogs);
    });
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return '#10b981';
      case 'connecting':
        return '#f59e0b';
      case 'disconnected':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'sent':
        return '#3b82f6';
      case 'received':
        return '#10b981';
      case 'status':
        return '#8b5cf6';
      default:
        return '#6b7280';
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        className="ws-debug-toggle"
        onClick={() => setIsOpen(!isOpen)}
        title="WebSocket Debug Panel"
      >
        <span className="ws-debug-icon">🔌</span>
        <span 
          className="ws-debug-status-dot" 
          style={{ backgroundColor: getStatusColor() }}
        />
      </button>

      {/* Debug Panel */}
      {isOpen && (
        <div className="ws-debug-panel">
          <div className="ws-debug-header">
            <h3>WebSocket Debug</h3>
            <div className="ws-debug-actions">
              <button onClick={clearLogs} className="ws-debug-clear">
                Clear
              </button>
              <button onClick={() => setIsOpen(false)} className="ws-debug-close">
                ✕
              </button>
            </div>
          </div>

          <div className="ws-debug-status">
            <div className="ws-status-item">
              <span className="ws-status-label">Status:</span>
              <span 
                className="ws-status-value"
                style={{ color: getStatusColor() }}
              >
                {connectionStatus.toUpperCase()}
              </span>
            </div>
            <div className="ws-status-item">
              <span className="ws-status-label">Logs:</span>
              <span className="ws-status-value">{logs.length}</span>
            </div>
          </div>

          <div className="ws-debug-logs">
            {logs.length === 0 ? (
              <div className="ws-debug-empty">No messages yet...</div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="ws-debug-log-entry">
                  <div className="ws-log-header">
                    <span className="ws-log-time">{log.timestamp}</span>
                    <span 
                      className="ws-log-type"
                      style={{ color: getTypeColor(log.type) }}
                    >
                      {log.type.toUpperCase()}
                    </span>
                    <span className="ws-log-event">{log.event}</span>
                  </div>
                  <div className="ws-log-data">
                    <pre>{JSON.stringify(log.data, null, 2)}</pre>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

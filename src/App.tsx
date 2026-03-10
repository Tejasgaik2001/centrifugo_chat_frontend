import { useState, useEffect } from 'react';
import Auth from './components/Auth';
import Chat from './components/Chat';
import { setToken, clearToken, userAPI } from './api';
import { ws } from './websocket';
import ConnectionBanner from './components/ConnectionBanner';

interface User {
  _id: string;
  username: string;
  name: string;
  email: string;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      setToken(token);
      userAPI.getMe()
        .then(res => {
          setUser(res.data);
          ws.connect(token);
        })
        .catch(() => {
          clearToken();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = (userData: User, token: string) => {
    setUser(userData);
    setToken(token);
    ws.connect(token);
  };

  const handleLogout = () => {
    setUser(null);
    clearToken();
    ws.disconnect();
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh' 
      }}>
        Loading...
      </div>
    );
  }

  return (
    <>
      <ConnectionBanner />
      {user ? (
        <Chat user={user} onLogout={handleLogout} />
      ) : (
        <Auth onLogin={handleLogin} />
      )}
    </>
  );
}

export default App;

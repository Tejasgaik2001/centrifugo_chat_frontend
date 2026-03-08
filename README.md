# Messaging Frontend

React + TypeScript frontend for testing the messaging backend.

## Features

- ✅ User authentication (login/register)
- ✅ Real-time messaging with WebSocket
- ✅ Room/conversation list
- ✅ Direct messaging
- ✅ Typing indicators
- ✅ Unread message counts
- ✅ Message timestamps
- ✅ Auto-reconnect WebSocket
- ✅ Responsive UI

## Quick Start

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Start Backend First

Make sure the backend is running on `http://localhost:3000`:

```bash
cd ../backend
npm run dev
```

### 3. Start Frontend

```bash
npm run dev
```

The app will be available at **http://localhost:5173**

## Usage

### Register a New Account

1. Click "Register" on the login page
2. Fill in:
   - Username (lowercase, alphanumeric + underscore)
   - Full Name
   - Email
   - Password (min 8 characters)
3. Click "Register"

### Start a Conversation

1. Click the **+** button in the sidebar
2. Search for a user by name or username
3. Click on a user to start a DM
4. Type your message and press Send

### Test Real-Time Features

1. Open the app in two different browsers/tabs
2. Register two different accounts
3. Start a conversation between them
4. Send messages and see them appear in real-time
5. Watch typing indicators when someone is typing

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Auth.tsx          # Login/Register
│   │   ├── Chat.tsx          # Main chat layout
│   │   ├── RoomList.tsx      # Sidebar with rooms
│   │   └── MessageList.tsx   # Message display & input
│   ├── api.ts                # Axios API client
│   ├── websocket.ts          # WebSocket client
│   ├── App.tsx               # Root component
│   └── main.tsx              # Entry point
├── index.html
├── vite.config.ts            # Vite config with proxy
└── package.json
```

## API Proxy

The Vite dev server proxies API requests:
- `/api/*` → `http://localhost:3000/api/*`
- `/ws` → `ws://localhost:3000/ws`

This avoids CORS issues during development.

## WebSocket Events

The frontend handles these WebSocket events:

- `auth` - Authenticate with JWT token
- `subscribe` - Subscribe to room updates
- `unsubscribe` - Unsubscribe from room
- `typing_start` - Start typing indicator
- `typing_stop` - Stop typing indicator
- `message_new` - New message received
- `ping` - Keep connection alive

## Build for Production

```bash
npm run build
```

Output will be in `dist/` folder.

## Environment Variables

Create `.env` if you need custom backend URL:

```env
VITE_API_URL=http://your-backend-url:3000
```

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool & dev server
- **Axios** - HTTP client
- **WebSocket** - Real-time communication
- **date-fns** - Date formatting

## Troubleshooting

### Backend not responding

Make sure backend is running:
```bash
cd backend
npm run dev
```

### WebSocket connection failed

1. Check backend is running on port 3000
2. Check browser console for errors
3. Verify JWT token is valid

### Messages not appearing

1. Open browser DevTools → Network → WS
2. Check WebSocket connection status
3. Verify you're subscribed to the room
4. Check backend logs for errors

## Next Steps

This is a minimal test frontend. For production, consider adding:

- [ ] Message editing/deletion UI
- [ ] File upload support
- [ ] Emoji picker
- [ ] Message reactions
- [ ] Thread replies
- [ ] User profiles
- [ ] Room settings
- [ ] Notification sounds
- [ ] Dark mode
- [ ] Mobile responsive improvements

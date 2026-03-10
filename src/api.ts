import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api/v1',
});

let accessToken: string | null = localStorage.getItem('accessToken');

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

export const setToken = (token: string) => {
  accessToken = token;
  localStorage.setItem('accessToken', token);
};

export const clearToken = () => {
  accessToken = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
};

export const authAPI = {
  register: (data: { username: string; email: string; password: string; name: string }) =>
    api.post('/auth/register', data),
  
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  
  logout: () => api.post('/auth/logout'),
};

export const userAPI = {
  getMe: () => api.get('/users/me'),
  search: (q: string) => api.get('/users/search', { params: { q } }),
  getPresence: () => api.get('/users/presence'),
};

export const roomAPI = {
  list: () => api.get('/rooms'),
  create: (data: { type: string; name: string; memberIds?: string[] }) =>
    api.post('/rooms', data),
  get: (rid: string) => api.get(`/rooms/${rid}`),
  getDM: (username: string) => api.get(`/rooms/dm/${username}`),
  markRead: (rid: string) => api.post(`/rooms/${rid}/read`),
  typing: (rid: string, isTyping: boolean) => api.post(`/rooms/${rid}/typing`, { isTyping }),
};

export const fileAPI = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

export const messageAPI = {
  list: (rid: string, params?: { limit?: number; before?: string }) =>
    api.get(`/rooms/${rid}/messages`, { params }),
  send: (data: { 
    rid: string; 
    msg: string; 
    tmid?: string;
    replyTo?: { _id: string; msg: string; u: { _id: string; username: string } };
    attachments?: Array<{ type: string; url: string; name: string; size: number; mimeType: string }>;
  }) =>
    api.post('/messages', {
      rid: data.rid,
      msg: data.msg,
      ...(data.tmid ? { tmid: data.tmid } : {}),
      ...(data.replyTo ? { replyTo: data.replyTo } : {}),
      ...(data.attachments ? { attachments: data.attachments } : {}),
    }),
  edit: (id: string, msg: string) => api.patch(`/messages/${id}`, { msg }),
  delete: (id: string) => api.delete(`/messages/${id}`),
  addReaction: (id: string, emoji: string) => api.post(`/messages/${id}/reactions`, { emoji }),
  removeReaction: (id: string, emoji: string) => api.delete(`/messages/${id}/reactions/${emoji}`),
};

export const centrifugoAPI = {
  getToken: () => api.get<{ token: string }>('/centrifugo/token'),
  getSubscriptionToken: (channel: string) =>
    api.post<{ token: string }>('/centrifugo/subscription-token', { channel }),
};

export default api;

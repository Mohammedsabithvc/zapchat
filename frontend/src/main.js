import './style.css';
import { renderAuth } from './auth/index.js';
import { renderApp } from './app.js';

export function getToken() { return localStorage.getItem('zc_token'); }

export async function apiFetch(method, path, body = null, isForm = false) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (!isForm && body) headers['Content-Type'] = 'application/json';
  const res = await fetch('/api' + path, {
    method, headers,
    body: isForm ? body : (body ? JSON.stringify(body) : null)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch('/api/upload', { method: 'POST', headers, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

async function init() {
  const token = getToken();
  if (token) {
    try {
      const user = await apiFetch('GET', '/auth/me');
      renderApp(user, () => { localStorage.removeItem('zc_token'); init(); });
      return;
    } catch { localStorage.removeItem('zc_token'); }
  }
  renderAuth((user) => renderApp(user, () => { localStorage.removeItem('zc_token'); init(); }));
}

init();

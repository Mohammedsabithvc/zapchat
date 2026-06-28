const BASE = '/api';
export const getToken = () => localStorage.getItem('zc_token');
export const setToken = t => localStorage.setItem('zc_token', t);
export const clearToken = () => localStorage.removeItem('zc_token');

async function req(method, path, body = null, isForm = false) {
  const h = {};
  const t = getToken();
  if (t) h['Authorization'] = 'Bearer ' + t;
  if (!isForm && body) h['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, {
    method, headers: h,
    body: isForm ? body : (body ? JSON.stringify(body) : null)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

export const api = {
  get: p => req('GET', p),
  post: (p, b) => req('POST', p, b),
  patch: (p, b) => req('PATCH', p, b),
  delete: (p, b) => req('DELETE', p, b),
  postForm: (p, f) => req('POST', p, f, true),
};

export async function uploadFile(fileBlob) {
  const fd = new FormData();
  // If it's a raw Blob (e.g. canvas snapshot), give it a timestamped filename.
  // If it's already a File object (normal uploads), multer still handles it fine.
  const isFile = fileBlob instanceof File;
  fd.append('file', fileBlob, isFile ? fileBlob.name : `snapshot_${Date.now()}.png`);
  return api.postForm('/upload', fd);
}

import { apiFetch, uploadFile, getToken } from './main.js';

export function renderProfile(currentUser, onUpdate, onLogout) {
  const existing = document.getElementById('profilePanel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'profilePanel';
  panel.style.cssText = `
    position:fixed;top:0;left:0;width:380px;height:100%;
    background:#111B21;z-index:200;display:flex;flex-direction:column;
    transform:translateX(-100%);transition:transform 0.25s ease;
    border-right:1px solid #2A3942;
  `;

  const avatarUrl = currentUser.avatar_url || null;
  const initials = currentUser.avatar || currentUser.display_name?.slice(0,2).toUpperCase() || '?';
  const color = currentUser.avatar_color || '#00A884';

  panel.innerHTML = `
    <div style="background:#202C33;padding:14px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0;">
      <button id="ppBack" style="background:none;border:none;color:#8696A0;font-size:22px;cursor:pointer;padding:4px;border-radius:50%;display:flex;align-items:center;justify-content:center;">
        <i class="ti ti-arrow-left"></i>
      </button>
      <div style="font-size:16px;font-weight:700;color:#E9EDEF;">Profile</div>
    </div>

    <div style="flex:1;overflow-y:auto;scrollbar-width:thin;">

      <!-- Avatar section -->
      <div style="background:#202C33;padding:32px 24px;display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="position:relative;cursor:pointer;" id="avatarWrap">
          ${avatarUrl
            ? `<img src="${avatarUrl}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;display:block;" />`
            : `<div style="width:100px;height:100px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;color:#fff;">${initials}</div>`
          }
          <div style="position:absolute;bottom:0;right:0;width:32px;height:32px;background:#00A884;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #202C33;">
            <i class="ti ti-camera" style="font-size:15px;color:#fff;"></i>
          </div>
        </div>
        <input type="file" id="avatarInput" accept="image/*" style="display:none;" />
        <div id="uploadStatus" style="font-size:12px;color:#8696A0;min-height:16px;"></div>
      </div>

      <!-- Name -->
      <div style="background:#202C33;margin-bottom:8px;">
        <div style="padding:10px 24px 4px;font-size:12px;color:#00A884;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Your name</div>
        <div style="padding:4px 24px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div id="nameDisplay" style="font-size:15px;color:#E9EDEF;flex:1;">${currentUser.display_name || ''}</div>
          <button id="editNameBtn" style="background:none;border:none;color:#8696A0;font-size:19px;cursor:pointer;padding:4px;"><i class="ti ti-pencil"></i></button>
        </div>
        <div id="nameEdit" style="display:none;padding:4px 24px 14px;">
          <input id="nameInput" style="width:100%;background:#2A3942;border:none;border-bottom:2px solid #00A884;padding:8px 4px;font-size:15px;color:#E9EDEF;outline:none;" value="${currentUser.display_name || ''}" maxlength="40" />
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
            <button id="nameCancelBtn" style="background:none;border:none;color:#8696A0;font-size:13px;cursor:pointer;padding:4px 8px;">Cancel</button>
            <button id="nameSaveBtn" style="background:none;border:none;color:#00A884;font-size:13px;font-weight:700;cursor:pointer;padding:4px 8px;">Save</button>
          </div>
        </div>
      </div>

      <!-- About -->
      <div style="background:#202C33;margin-bottom:8px;">
        <div style="padding:10px 24px 4px;font-size:12px;color:#00A884;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">About</div>
        <div style="padding:4px 24px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div id="aboutDisplay" style="font-size:15px;color:#E9EDEF;flex:1;">${currentUser.about || 'Hey, I am using ZapChat!'}</div>
          <button id="editAboutBtn" style="background:none;border:none;color:#8696A0;font-size:19px;cursor:pointer;padding:4px;"><i class="ti ti-pencil"></i></button>
        </div>
        <div id="aboutEdit" style="display:none;padding:4px 24px 14px;">
          <textarea id="aboutInput" style="width:100%;background:#2A3942;border:none;border-bottom:2px solid #00A884;padding:8px 4px;font-size:15px;color:#E9EDEF;outline:none;resize:none;height:70px;font-family:inherit;" maxlength="139">${currentUser.about || 'Hey, I am using ZapChat!'}</textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
            <span id="aboutCount" style="font-size:11px;color:#8696A0;">0/139</span>
            <div style="display:flex;gap:8px;">
              <button id="aboutCancelBtn" style="background:none;border:none;color:#8696A0;font-size:13px;cursor:pointer;padding:4px 8px;">Cancel</button>
              <button id="aboutSaveBtn" style="background:none;border:none;color:#00A884;font-size:13px;font-weight:700;cursor:pointer;padding:4px 8px;">Save</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Account info -->
      <div style="background:#202C33;margin-bottom:8px;">
        <div style="padding:10px 24px 4px;font-size:12px;color:#00A884;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Account</div>
        ${currentUser.phone ? `
        <div style="padding:10px 24px;display:flex;align-items:center;gap:14px;border-bottom:1px solid #2A3942;">
          <i class="ti ti-phone" style="font-size:20px;color:#8696A0;flex-shrink:0;"></i>
          <div>
            <div style="font-size:15px;color:#E9EDEF;">${currentUser.phone}</div>
            <div style="font-size:11px;color:#8696A0;margin-top:2px;">Phone</div>
          </div>
        </div>` : ''}
        ${currentUser.email ? `
        <div style="padding:10px 24px;display:flex;align-items:center;gap:14px;border-bottom:1px solid #2A3942;">
          <i class="ti ti-mail" style="font-size:20px;color:#8696A0;flex-shrink:0;"></i>
          <div>
            <div style="font-size:15px;color:#E9EDEF;">${currentUser.email}</div>
            <div style="font-size:11px;color:#8696A0;margin-top:2px;">Email</div>
          </div>
        </div>` : ''}
        <div style="padding:10px 24px;display:flex;align-items:center;gap:14px;">
          <i class="ti ti-at" style="font-size:20px;color:#8696A0;flex-shrink:0;"></i>
          <div>
            <div style="font-size:15px;color:#E9EDEF;">@${currentUser.username}</div>
            <div style="font-size:11px;color:#8696A0;margin-top:2px;">Username</div>
          </div>
        </div>
      </div>

      <!-- Settings -->
      <div style="background:#202C33;margin-bottom:8px;">
        <div style="padding:10px 24px 4px;font-size:12px;color:#00A884;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Settings</div>
        <div style="padding:14px 24px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #2A3942;cursor:pointer;" id="notifRow">
          <div style="display:flex;align-items:center;gap:14px;">
            <i class="ti ti-bell" style="font-size:20px;color:#8696A0;"></i>
            <div style="font-size:15px;color:#E9EDEF;">Notifications</div>
          </div>
          <div id="notifToggle" style="width:44px;height:24px;background:#00A884;border-radius:12px;position:relative;cursor:pointer;transition:background 0.2s;">
            <div style="position:absolute;top:2px;right:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:right 0.2s;"></div>
          </div>
        </div>
        <div style="padding:14px 24px;display:flex;align-items:center;gap:14px;cursor:pointer;">
          <i class="ti ti-lock" style="font-size:20px;color:#8696A0;"></i>
          <div style="font-size:15px;color:#E9EDEF;">Privacy</div>
          <i class="ti ti-chevron-right" style="font-size:16px;color:#8696A0;margin-left:auto;"></i>
        </div>
      </div>

      <!-- Logout + Delete -->
      <div style="background:#202C33;margin-bottom:24px;">
        <button id="ppLogout" style="width:100%;padding:16px 24px;display:flex;align-items:center;gap:14px;border:none;background:none;cursor:pointer;border-bottom:1px solid #2A3942;text-align:left;">
          <i class="ti ti-logout" style="font-size:20px;color:#F15C6D;"></i>
          <span style="font-size:15px;color:#F15C6D;font-weight:500;">Log out</span>
        </button>
        <button id="ppDelete" style="width:100%;padding:16px 24px;display:flex;align-items:center;gap:14px;border:none;background:none;cursor:pointer;text-align:left;">
          <i class="ti ti-trash" style="font-size:20px;color:#F15C6D;"></i>
          <span style="font-size:15px;color:#F15C6D;font-weight:500;">Delete account</span>
        </button>
      </div>

    </div>

    <!-- Toast inside panel -->
    <div id="ppToast" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%) translateY(60px);background:#2A3942;color:#E9EDEF;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:500;transition:transform 0.25s;white-space:nowrap;pointer-events:none;"></div>
  `;

  document.body.appendChild(panel);
  requestAnimationFrame(() => { panel.style.transform = 'translateX(0)'; });

  function close() {
    panel.style.transform = 'translateX(-100%)';
    setTimeout(() => panel.remove(), 250);
  }

  function showToast(msg) {
    const t = document.getElementById('ppToast');
    if (!t) return;
    t.textContent = msg;
    t.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => { t.style.transform = 'translateX(-50%) translateY(60px)'; }, 2500);
  }

  function setUploadStatus(msg, color = '#8696A0') {
    const el = document.getElementById('uploadStatus');
    if (el) { el.textContent = msg; el.style.color = color; }
  }

  // Back button
  document.getElementById('ppBack').onclick = close;

  // Avatar upload
  document.getElementById('avatarWrap').onclick = () => document.getElementById('avatarInput').click();
  document.getElementById('avatarInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return showToast('Image must be under 5MB');
    setUploadStatus('Uploading...', '#00A884');
    try {
      const result = await uploadFile(file);
      await apiFetch('PUT', '/users/me', { avatar_url: result.url });
      // Update avatar display
      const wrap = document.getElementById('avatarWrap');
      const existing = wrap.querySelector('img, div:not([style*="position:absolute"])');
      if (existing) {
        const img = document.createElement('img');
        img.src = result.url;
        img.style.cssText = 'width:100px;height:100px;border-radius:50%;object-fit:cover;display:block;';
        wrap.replaceChild(img, existing);
      }
      setUploadStatus('Photo updated ✓', '#00A884');
      currentUser.avatar_url = result.url;
      onUpdate(currentUser);
      setTimeout(() => setUploadStatus(''), 3000);
    } catch (err) {
      setUploadStatus('Upload failed', '#F15C6D');
    }
    e.target.value = '';
  };

  // Edit name
  document.getElementById('editNameBtn').onclick = () => {
    document.getElementById('nameDisplay').parentElement.style.display = 'none';
    document.getElementById('nameEdit').style.display = 'block';
    document.getElementById('nameInput').focus();
    document.getElementById('nameInput').select();
  };
  document.getElementById('nameCancelBtn').onclick = () => {
    document.getElementById('nameDisplay').parentElement.style.display = 'flex';
    document.getElementById('nameEdit').style.display = 'none';
  };
  document.getElementById('nameSaveBtn').onclick = async () => {
    const val = document.getElementById('nameInput').value.trim();
    if (!val || val.length < 2) return showToast('Name must be at least 2 characters');
    try {
      const updated = await apiFetch('PUT', '/users/me', { display_name: val });
      document.getElementById('nameDisplay').textContent = val;
      document.getElementById('nameDisplay').parentElement.style.display = 'flex';
      document.getElementById('nameEdit').style.display = 'none';
      currentUser.display_name = val;
      onUpdate(currentUser);
      showToast('Name updated ✓');
    } catch { showToast('Failed to update name'); }
  };
  document.getElementById('nameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('nameSaveBtn').click();
    if (e.key === 'Escape') document.getElementById('nameCancelBtn').click();
  });

  // Edit about
  const aboutInput = document.getElementById('aboutInput');
  const aboutCount = document.getElementById('aboutCount');
  aboutInput.addEventListener('input', () => {
    aboutCount.textContent = aboutInput.value.length + '/139';
  });
  aboutCount.textContent = aboutInput.value.length + '/139';

  document.getElementById('editAboutBtn').onclick = () => {
    document.getElementById('aboutDisplay').parentElement.style.display = 'none';
    document.getElementById('aboutEdit').style.display = 'block';
    aboutInput.focus();
  };
  document.getElementById('aboutCancelBtn').onclick = () => {
    document.getElementById('aboutDisplay').parentElement.style.display = 'flex';
    document.getElementById('aboutEdit').style.display = 'none';
  };
  document.getElementById('aboutSaveBtn').onclick = async () => {
    const val = aboutInput.value.trim();
    try {
      await apiFetch('PUT', '/users/me', { about: val });
      document.getElementById('aboutDisplay').textContent = val || 'Hey, I am using ZapChat!';
      document.getElementById('aboutDisplay').parentElement.style.display = 'flex';
      document.getElementById('aboutEdit').style.display = 'none';
      currentUser.about = val;
      onUpdate(currentUser);
      showToast('About updated ✓');
    } catch { showToast('Failed to update'); }
  };

  // Notification toggle
  let notifOn = true;
  document.getElementById('notifRow').onclick = () => {
    notifOn = !notifOn;
    const t = document.getElementById('notifToggle');
    t.style.background = notifOn ? '#00A884' : '#374045';
    t.querySelector('div').style.right = notifOn ? '2px' : 'calc(100% - 22px)';
  };

  // Logout
  document.getElementById('ppLogout').onclick = () => {
    if (confirm('Are you sure you want to log out?')) {
      close();
      setTimeout(onLogout, 300);
    }
  };

  // Delete account
  document.getElementById('ppDelete').onclick = () => {
    if (confirm('Delete your account? This cannot be undone. All your messages will be deleted.')) {
      apiFetch('DELETE', '/users/me').catch(() => {});
      close();
      setTimeout(onLogout, 300);
    }
  };

  // Close on outside click (desktop)
  setTimeout(() => {
    document.addEventListener('click', function outsideClick(e) {
      if (!panel.contains(e.target) && !document.getElementById('btnProfile')?.contains(e.target)) {
        close();
        document.removeEventListener('click', outsideClick);
      }
    });
  }, 300);
}

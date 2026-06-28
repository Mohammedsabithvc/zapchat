import { apiFetch } from '../main.js';

export function renderLogin({ onDone, onRegister }) {
  let mode = 'login'; // login | forgot | reset

  const app = document.getElementById('app');

  function mount() {
    app.innerHTML = `
    <div class="auth-wrap">
      <div style="width:100%;max-width:400px;display:flex;align-items:center;margin-bottom:8px;">
        <button id="btnBack" style="background:none;border:none;color:var(--panel-text2);font-size:22px;cursor:pointer;padding:4px;"><i class="ti ti-arrow-left"></i></button>
        <div style="flex:1;text-align:center;">
          <span style="font-size:20px;font-weight:800;color:var(--panel-text);">Zap<span style="color:var(--acc);">.</span></span>
        </div>
        <div style="width:32px;"></div>
      </div>
      <div class="auth-card" id="loginCard"></div>
    </div>`;
    renderCard();
    document.getElementById('btnBack').onclick = () => {
      if (mode !== 'login') { mode = 'login'; renderCard(); return; }
      import('./welcome.js').then(m => m.renderWelcome({ onRegister, onLogin: () => renderLogin({ onDone, onRegister }) }));
    };
  }

  function renderCard() {
    const card = document.getElementById('loginCard');
    if (mode === 'login') card.innerHTML = loginHTML();
    else if (mode === 'forgot') card.innerHTML = forgotHTML();
    else if (mode === 'reset') card.innerHTML = resetHTML();
    bindCard();
  }

  function loginHTML() {
    return `
      <div class="auth-step-title">Welcome back</div>
      <div class="auth-step-sub">Sign in to your ZapChat account.</div>
      <div class="auth-error" id="authErr"></div>
      <div class="form-group">
        <label class="form-label">Username or email</label>
        <input class="form-input" id="inId" placeholder="username or email" autocomplete="username email" />
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <div style="position:relative;">
          <input class="form-input" id="inPass" type="password" placeholder="Your password" autocomplete="current-password" style="padding-right:44px;" />
          <button id="togglePass" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--panel-text2);font-size:18px;cursor:pointer;"><i class="ti ti-eye"></i></button>
        </div>
      </div>
      <button class="auth-btn" id="loginBtn">Log in</button>
      <div style="text-align:center;margin-top:14px;">
        <a href="#" id="forgotBtn" style="font-size:13px;color:var(--acc);font-weight:600;">Forgot password?</a>
      </div>
      <div style="margin-top:20px;text-align:center;font-size:13px;color:var(--panel-text2);">
        Don't have an account? <a href="#" id="switchRegister" style="color:var(--acc);font-weight:600;">Sign up</a>
      </div>`;
  }

  function forgotHTML() {
    return `
      <div class="auth-step-title">Reset password</div>
      <div class="auth-step-sub">Enter your email or phone and we'll send you a reset code.</div>
      <div class="auth-error" id="authErr"></div>
      <div class="form-group">
        <label class="form-label">Email or phone</label>
        <input class="form-input" id="inContact" placeholder="you@email.com or +44..." autocomplete="email tel" />
      </div>
      <button class="auth-btn" id="forgotSubmit">Send reset code <i class="ti ti-send"></i></button>`;
  }

  function resetHTML() {
    return `
      <div class="auth-step-title">Enter the code</div>
      <div class="auth-step-sub">Enter the code we sent you, then choose a new password.</div>
      <div class="auth-error" id="authErr"></div>
      <div class="otp-inputs" id="otpInputs">
        ${[0,1,2,3,4,5].map(i => `<input class="otp-input" maxlength="1" inputmode="numeric" data-i="${i}" />`).join('')}
      </div>
      <div class="form-group" style="margin-top:16px;">
        <label class="form-label">New password</label>
        <input class="form-input" id="inNewPass" type="password" placeholder="Min 6 characters" autocomplete="new-password" />
      </div>
      <button class="auth-btn" id="resetSubmit"><i class="ti ti-check"></i> Reset password</button>`;
  }

  function showErr(msg) { const el = document.getElementById('authErr'); if (el) { el.textContent = msg; el.classList.add('show'); } }
  function clearErr() { const el = document.getElementById('authErr'); if (el) el.classList.remove('show'); }
  function setLoading(btn, on) { if (!btn) return; btn.disabled = on; if (on) btn.innerHTML = '<span class="spinner"></span>'; }

  let resetContact = '';

  function bindCard() {
    if (mode === 'login') {
      document.getElementById('inId')?.focus();
      document.getElementById('togglePass')?.addEventListener('click', () => {
        const inp = document.getElementById('inPass');
        const icon = document.querySelector('#togglePass i');
        if (inp.type === 'password') { inp.type = 'text'; icon.className = 'ti ti-eye-off'; }
        else { inp.type = 'password'; icon.className = 'ti ti-eye'; }
      });
      document.getElementById('switchRegister')?.addEventListener('click', e => { e.preventDefault(); onRegister(); });
      document.getElementById('forgotBtn')?.addEventListener('click', e => { e.preventDefault(); mode = 'forgot'; renderCard(); });
      ['inId','inPass'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginBtn')?.click(); });
      });
      document.getElementById('loginBtn').onclick = async () => {
        const identifier = document.getElementById('inId')?.value?.trim();
        const password = document.getElementById('inPass')?.value;
        if (!identifier || !password) return showErr('Please fill in all fields');
        clearErr();
        const btn = document.getElementById('loginBtn');
        setLoading(btn, true);
        try {
          const res = await apiFetch('POST', '/auth/login', { identifier, password });
          localStorage.setItem('zc_token', res.token);
          onDone(res.user);
        } catch (e) { showErr(e.message); btn.disabled = false; btn.textContent = 'Log in'; }
      };
    }

    if (mode === 'forgot') {
      document.getElementById('inContact')?.focus();
      document.getElementById('forgotSubmit').onclick = async () => {
        const contact = document.getElementById('inContact')?.value?.trim();
        if (!contact) return showErr('Please enter your email or phone');
        clearErr();
        const btn = document.getElementById('forgotSubmit');
        setLoading(btn, true);
        try {
          resetContact = contact;
          await apiFetch('POST', '/auth/forgot-password', { contact });
          mode = 'reset'; renderCard();
        } catch (e) { showErr(e.message); btn.disabled = false; btn.innerHTML = 'Send reset code <i class="ti ti-send"></i>'; }
      };
    }

    if (mode === 'reset') {
      const inputs = document.querySelectorAll('.otp-input');
      inputs.forEach((inp, i) => {
        inp.addEventListener('input', () => {
          inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
          if (inp.value && i < 5) inputs[i + 1].focus();
        });
        inp.addEventListener('keydown', e => { if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus(); });
        inp.addEventListener('paste', e => {
          const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
          if (text.length === 6) inputs.forEach((el, j) => el.value = text[j] || '');
          e.preventDefault();
        });
      });
      inputs[0]?.focus();

      document.getElementById('resetSubmit').onclick = async () => {
        const otp = Array.from(document.querySelectorAll('.otp-input')).map(i => i.value).join('');
        const newPassword = document.getElementById('inNewPass')?.value;
        if (otp.length < 6) return showErr('Enter the full 6-digit code');
        if (!newPassword || newPassword.length < 6) return showErr('Password must be at least 6 characters');
        clearErr();
        const btn = document.getElementById('resetSubmit');
        setLoading(btn, true);
        try {
          await apiFetch('POST', '/auth/reset-password', { contact: resetContact, otp, newPassword });
          mode = 'login'; renderCard();
          setTimeout(() => showErr('✅ Password reset! Please log in.'), 100);
        } catch (e) { showErr(e.message); btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> Reset password'; }
      };
    }
  }

  mount();
}

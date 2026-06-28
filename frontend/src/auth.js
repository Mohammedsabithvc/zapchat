import { apiFetch } from './main.js';

export function renderAuth(onAuth) {
  let step = 'contact';
  let contactVal = '';
  let contactType = '';
  let resendTimer = null;
  let resendSec = 60;

  const app = document.getElementById('app');

  function mount() {
    app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-logo-row">
        <div class="auth-logo-icon"><i class="ti ti-bolt"></i></div>
        <div class="auth-logo-text">Zap<span>.</span></div>
      </div>
      <div class="auth-card" id="authCard"></div>
    </div>`;
    renderStep();
  }

  function renderStep() {
    const card = document.getElementById('authCard');
    if (step === 'contact') card.innerHTML = contactHTML();
    else if (step === 'otp') card.innerHTML = otpHTML();
    else if (step === 'profile') card.innerHTML = profileHTML();
    bindStep();
  }

  function contactHTML() {
    return `
      <div class="auth-step-title">Welcome to Zap.</div>
      <div class="auth-step-sub">Enter your email or phone number. We will send you a verification code.</div>
      <div class="auth-error" id="authErr"></div>
      <div class="form-group">
        <label class="form-label">Email or phone number</label>
        <input class="form-input" id="contactInput" placeholder="+44 7700 900000 or you@email.com" autocomplete="tel email" />
      </div>
      <button class="auth-btn" id="authSubmit"><i class="ti ti-send"></i> Send code</button>`;
  }

  function otpHTML() {
    return `
      <div class="auth-step-title">Enter the code</div>
      <div class="auth-step-sub">We sent a 6-digit code to <strong style="color:var(--acc)">${contactVal}</strong></div>
      <div class="auth-error" id="authErr"></div>
      <div class="otp-inputs" id="otpInputs">
        ${[0,1,2,3,4,5].map(i => `<input class="otp-input" maxlength="1" inputmode="numeric" pattern="[0-9]" data-i="${i}" />`).join('')}
      </div>
      <button class="auth-btn" id="authSubmit"><i class="ti ti-check"></i> Verify</button>
      <div class="resend-row">
        <span id="resendLabel">Resend code in <span id="resendSec">${resendSec}</span>s</span>
        <button class="resend-btn" id="resendBtn" disabled>Resend</button>
      </div>
      <div style="margin-top:12px;text-align:center;">
        <a href="#" id="changeContact" style="font-size:12px;color:var(--panel-text2);">Change ${contactType}</a>
      </div>`;
  }

  function profileHTML() {
    return `
      <div class="auth-step-title">Set up your profile</div>
      <div class="auth-step-sub">Almost done! Choose a name and a unique username.</div>
      <div class="auth-error" id="authErr"></div>
      <div class="form-group">
        <label class="form-label">Your name</label>
        <input class="form-input" id="displayName" placeholder="e.g. Sabith" autocomplete="name" />
      </div>
      <div class="form-group">
        <label class="form-label">Username</label>
        <input class="form-input" id="username" placeholder="e.g. sabith_vc" autocomplete="off" />
        <div style="font-size:11px;color:var(--panel-text2);margin-top:6px;line-height:1.5;">
          Letters, numbers and underscores only. No spaces. Min 3 characters.
        </div>
      </div>
      <button class="auth-btn" id="authSubmit"><i class="ti ti-arrow-right"></i> Get started</button>`;
  }

  function showErr(msg) {
    const el = document.getElementById('authErr');
    if (el) { el.textContent = msg; el.classList.add('show'); }
  }

  function clearErr() {
    const el = document.getElementById('authErr');
    if (el) { el.textContent = ''; el.classList.remove('show'); }
  }

  function setLoading(on) {
    const btn = document.getElementById('authSubmit');
    if (!btn) return;
    btn.disabled = on;
    btn.innerHTML = on ? '<span class="spinner"></span>' : (
      step === 'contact' ? '<i class="ti ti-send"></i> Send code' :
      step === 'otp' ? '<i class="ti ti-check"></i> Verify' :
      '<i class="ti ti-arrow-right"></i> Get started'
    );
  }

  function startResendTimer() {
    resendSec = 60;
    const secEl = document.getElementById('resendSec');
    const btnEl = document.getElementById('resendBtn');
    const lblEl = document.getElementById('resendLabel');
    if (resendTimer) clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      resendSec--;
      if (secEl) secEl.textContent = resendSec;
      if (resendSec <= 0) {
        clearInterval(resendTimer);
        if (lblEl) lblEl.style.display = 'none';
        if (btnEl) btnEl.disabled = false;
      }
    }, 1000);
  }

  function bindStep() {
    if (step === 'contact') {
      const input = document.getElementById('contactInput');
      input?.focus();
      input?.addEventListener('keydown', e => { if (e.key === 'Enter') submitContact(); });
      document.getElementById('authSubmit')?.addEventListener('click', submitContact);
    }

    if (step === 'otp') {
      const inputs = document.querySelectorAll('.otp-input');
      inputs.forEach((inp, i) => {
        inp.addEventListener('input', () => {
          inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
          if (inp.value && i < 5) inputs[i + 1].focus();
          if (i === 5 && inp.value) submitOTP();
        });
        inp.addEventListener('keydown', e => {
          if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
        });
        inp.addEventListener('paste', e => {
          const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
          if (text.length === 6) {
            inputs.forEach((el, j) => el.value = text[j] || '');
            setTimeout(submitOTP, 100);
          }
          e.preventDefault();
        });
      });
      inputs[0]?.focus();
      document.getElementById('authSubmit')?.addEventListener('click', submitOTP);
      document.getElementById('resendBtn')?.addEventListener('click', resendOTP);
      document.getElementById('changeContact')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (resendTimer) clearInterval(resendTimer);
        step = 'contact';
        renderStep();
      });
      startResendTimer();
    }

    if (step === 'profile') {
      document.getElementById('displayName')?.focus();

      // Auto-suggest username from display name
      document.getElementById('displayName')?.addEventListener('input', () => {
        const dn = document.getElementById('displayName')?.value?.trim() || '';
        const un = document.getElementById('username');
        if (un && !un.value) {
          un.value = dn.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 20);
        }
      });

      // Clean username live as user types - strip spaces and bad chars instantly
      document.getElementById('username')?.addEventListener('input', () => {
        const el = document.getElementById('username');
        const pos = el.selectionStart;
        const cleaned = el.value.replace(/\s/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
        if (el.value !== cleaned) {
          el.value = cleaned;
          el.setSelectionRange(pos, pos);
        }
        clearErr();
      });

      document.getElementById('authSubmit')?.addEventListener('click', submitProfile);
      ['displayName', 'username'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => {
          if (e.key === 'Enter') submitProfile();
        });
      });
    }
  }

  async function submitContact() {
    const val = document.getElementById('contactInput')?.value?.trim();
    if (!val) return showErr('Please enter your email or phone number');
    clearErr();
    setLoading(true);
    try {
      const res = await apiFetch('POST', '/auth/send-otp', { contact: val });
      contactVal = val;
      contactType = res.type;
      step = 'otp';
      renderStep();
    } catch (e) {
      showErr(e.message);
      setLoading(false);
    }
  }

  async function submitOTP() {
    const inputs = document.querySelectorAll('.otp-input');
    const otp = Array.from(inputs).map(i => i.value).join('');
    if (otp.length < 6) return showErr('Enter the full 6-digit code');
    clearErr();
    setLoading(true);
    try {
      const res = await apiFetch('POST', '/auth/verify-otp', { contact: contactVal, otp });
      if (res.needsProfile) {
        step = 'profile';
        renderStep();
        return;
      }
      if (res.token) {
        localStorage.setItem('zc_token', res.token);
        onAuth(res.user);
      }
    } catch (e) {
      showErr(e.message);
      setLoading(false);
    }
  }

  async function resendOTP() {
    try {
      await apiFetch('POST', '/auth/send-otp', { contact: contactVal });
      startResendTimer();
      const btn = document.getElementById('resendBtn');
      const lbl = document.getElementById('resendLabel');
      if (btn) btn.disabled = true;
      if (lbl) lbl.style.display = '';
    } catch (e) {
      showErr(e.message);
    }
  }

  async function submitProfile() {
    const displayName = document.getElementById('displayName')?.value?.trim();
    const username = document.getElementById('username')?.value?.trim();

    if (!displayName) return showErr('Please enter your name');
    if (!username) return showErr('Please choose a username');
    if (username.length < 3) return showErr('Username must be at least 3 characters');
    if (username.length > 20) return showErr('Username must be 20 characters or less');
    if (/\s/.test(username)) return showErr('No spaces allowed — use underscore e.g. john_doe');
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return showErr('Only letters, numbers and underscores allowed');

    clearErr();
    setLoading(true);

    try {
      const res = await apiFetch('POST', '/auth/complete-profile', {
        contact: contactVal,
        displayName,
        username: username.toLowerCase()
      });
      localStorage.setItem('zc_token', res.token);
      onAuth(res.user);
    } catch (e) {
      showErr(e.message);
      setLoading(false);
    }
  }

  mount();
}

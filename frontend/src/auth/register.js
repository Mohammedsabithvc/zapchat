import { apiFetch } from '../main.js';

export function renderRegister({ onDone, onLogin }) {
  let step = 1;
  let data = { displayName: '', contact: '', contactType: '', password: '', username: '' };
  let resendTimer = null, resendSec = 60;

  const app = document.getElementById('app');

  function mount() {
    app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-logo-row" style="margin-bottom:0;width:100%;max-width:400px;">
        <button id="btnBack" style="background:none;border:none;color:var(--panel-text2);font-size:22px;cursor:pointer;padding:4px;border-radius:8px;display:flex;align-items:center;gap:6px;">
          <i class="ti ti-arrow-left"></i>
        </button>
        <div style="flex:1;text-align:center;font-size:14px;font-weight:600;color:var(--panel-text2);">Step ${step} of 5</div>
        <div style="width:32px;"></div>
      </div>
      <div style="width:100%;max-width:400px;background:var(--acc);border-radius:4px;height:3px;margin:12px 0;">
        <div style="width:${(step/5)*100}%;height:100%;background:var(--acc);border-radius:4px;transition:width 0.3s;"></div>
      </div>
      <div class="auth-card" id="stepCard" style="margin-top:8px;"></div>
    </div>`;
    renderStep();
    document.getElementById('btnBack').onclick = () => {
      if (step === 1) { onLogin ? renderWelcomeBack() : onLogin(); return; }
      step--;
      mount();
    };
  }

  function renderWelcomeBack() {
    import('./welcome.js').then(m => m.renderWelcome({ onRegister: () => renderRegister({ onDone, onLogin }), onLogin }));
  }

  function renderStep() {
    const card = document.getElementById('stepCard');
    const steps = [step1HTML, step2HTML, step3HTML, step4HTML, step5HTML];
    card.innerHTML = steps[step - 1]();
    bindStep();
  }

  function step1HTML() {
    return `
      <div class="auth-step-title">What's your name?</div>
      <div class="auth-step-sub">Enter your name so your friends can find you.</div>
      <div class="auth-error" id="authErr"></div>
      <div class="form-group">
        <label class="form-label">Full name</label>
        <input class="form-input" id="inName" placeholder="e.g. William John" autocomplete="name" value="${data.displayName}" />
      </div>
      <button class="auth-btn" id="stepBtn">Next <i class="ti ti-arrow-right"></i></button>`;
  }

  function step2HTML() {
    return `
      <div class="auth-step-title">Your email or phone</div>
      <div class="auth-step-sub">We'll send a verification code to confirm it's you.</div>
      <div class="auth-error" id="authErr"></div>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <button id="tabEmail" style="flex:1;padding:8px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;${data.contactType !== 'phone' ? 'background:var(--acc);color:#fff;border:none;' : 'background:var(--panel3);color:var(--panel-text2);border:1px solid var(--panel3);'}">Email</button>
        <button id="tabPhone" style="flex:1;padding:8px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;${data.contactType === 'phone' ? 'background:var(--acc);color:#fff;border:none;' : 'background:var(--panel3);color:var(--panel-text2);border:1px solid var(--panel3);'}">Phone</button>
      </div>
      <div class="form-group">
        <label class="form-label" id="contactLabel">${data.contactType === 'phone' ? 'Phone number' : 'Email address'}</label>
        <input class="form-input" id="inContact" type="${data.contactType === 'phone' ? 'tel' : 'email'}"
          placeholder="${data.contactType === 'phone' ? '+44 7700 900000' : 'you@email.com'}"
          autocomplete="${data.contactType === 'phone' ? 'tel' : 'email'}"
          value="${data.contact}" />
      </div>
      <button class="auth-btn" id="stepBtn">Send verification code <i class="ti ti-send"></i></button>`;
  }

  function step3HTML() {
    return `
      <div class="auth-step-title">Enter the code</div>
      <div class="auth-step-sub">We sent a 6-digit code to <strong style="color:var(--acc);">${data.contact}</strong></div>
      <div class="auth-error" id="authErr"></div>
      <div class="otp-inputs" id="otpInputs">
        ${[0,1,2,3,4,5].map(i => `<input class="otp-input" maxlength="1" inputmode="numeric" pattern="[0-9]" data-i="${i}" />`).join('')}
      </div>
      <button class="auth-btn" id="stepBtn"><i class="ti ti-check"></i> Verify</button>
      <div class="resend-row" style="margin-top:12px;">
        <span id="resendLabel" style="font-size:13px;color:var(--panel-text2);">Resend in <span id="resendSec">${resendSec}</span>s</span>
        <button class="resend-btn" id="resendBtn" disabled>Resend code</button>
      </div>`;
  }

  function step4HTML() {
    return `
      <div class="auth-step-title">Create a password</div>
      <div class="auth-step-sub">Choose a strong password with at least 6 characters.</div>
      <div class="auth-error" id="authErr"></div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <div style="position:relative;">
          <input class="form-input" id="inPass" type="password" placeholder="Min 6 characters" autocomplete="new-password" style="padding-right:44px;" />
          <button id="togglePass" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--panel-text2);font-size:18px;cursor:pointer;"><i class="ti ti-eye"></i></button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Confirm password</label>
        <input class="form-input" id="inPass2" type="password" placeholder="Repeat password" autocomplete="new-password" />
      </div>
      <button class="auth-btn" id="stepBtn">Continue <i class="ti ti-arrow-right"></i></button>`;
  }

  function step5HTML() {
    const suggested = data.displayName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 20);
    return `
      <div class="auth-step-title">Choose a username</div>
      <div class="auth-step-sub">This is how people find you on ZapChat.</div>
      <div class="auth-error" id="authErr"></div>
      <div class="form-group">
        <label class="form-label">Username</label>
        <div style="position:relative;">
          <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--panel-text2);font-size:15px;font-weight:600;">@</span>
          <input class="form-input" id="inUsername" placeholder="${suggested}" autocomplete="off" style="padding-left:32px;" value="${data.username || suggested}" />
        </div>
        <div style="font-size:11px;color:var(--panel-text2);margin-top:6px;">Letters, numbers, underscores only. No spaces.</div>
      </div>
      <button class="auth-btn" id="stepBtn"><i class="ti ti-check"></i> Create account</button>
      <div style="margin-top:14px;text-align:center;font-size:13px;color:var(--panel-text2);">
        Already have an account? <a href="#" id="switchLogin" style="color:var(--acc);font-weight:600;">Log in</a>
      </div>`;
  }

  function showErr(msg) { const el = document.getElementById('authErr'); if (el) { el.textContent = msg; el.classList.add('show'); } }
  function clearErr() { const el = document.getElementById('authErr'); if (el) { el.classList.remove('show'); } }
  function setLoading(on) {
    const btn = document.getElementById('stepBtn');
    if (!btn) return;
    btn.disabled = on;
    if (on) btn.innerHTML = '<span class="spinner"></span>';
  }

  function startResend() {
    resendSec = 60;
    if (resendTimer) clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      resendSec--;
      const el = document.getElementById('resendSec');
      if (el) el.textContent = resendSec;
      if (resendSec <= 0) {
        clearInterval(resendTimer);
        const lbl = document.getElementById('resendLabel');
        const btn = document.getElementById('resendBtn');
        if (lbl) lbl.style.display = 'none';
        if (btn) btn.disabled = false;
      }
    }, 1000);
  }

  function bindStep() {
    if (step === 1) {
      document.getElementById('inName')?.focus();
      document.getElementById('stepBtn').onclick = () => {
        const val = document.getElementById('inName')?.value?.trim();
        if (!val || val.length < 2) return showErr('Please enter your full name');
        data.displayName = val;
        step = 2; mount();
      };
      document.getElementById('inName')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('stepBtn').click(); });
    }

    if (step === 2) {
      let usePhone = data.contactType === 'phone';
      document.getElementById('tabEmail').onclick = () => { usePhone = false; data.contactType = 'email'; mount(); };
      document.getElementById('tabPhone').onclick = () => { usePhone = true; data.contactType = 'phone'; mount(); };
      document.getElementById('inContact')?.focus();
      document.getElementById('stepBtn').onclick = async () => {
        const val = document.getElementById('inContact')?.value?.trim();
        if (!val) return showErr('Please enter your ' + (usePhone ? 'phone number' : 'email'));
        clearErr(); setLoading(true);
        try {
          const res = await apiFetch('POST', '/auth/send-otp', { contact: val });
          data.contact = val;
          data.contactType = res.type;
          step = 3; mount();
        } catch (e) { showErr(e.message); setLoading(false); }
      };
      document.getElementById('inContact')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('stepBtn').click(); });
    }

    if (step === 3) {
      const inputs = document.querySelectorAll('.otp-input');
      inputs.forEach((inp, i) => {
        inp.addEventListener('input', () => {
          inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
          if (inp.value && i < 5) inputs[i + 1].focus();
          if (i === 5 && inp.value) document.getElementById('stepBtn').click();
        });
        inp.addEventListener('keydown', e => { if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus(); });
        inp.addEventListener('paste', e => {
          const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
          if (text.length === 6) { inputs.forEach((el, j) => el.value = text[j] || ''); setTimeout(() => document.getElementById('stepBtn').click(), 100); }
          e.preventDefault();
        });
      });
      inputs[0]?.focus();
      startResend();

      document.getElementById('resendBtn')?.addEventListener('click', async () => {
        try {
          await apiFetch('POST', '/auth/send-otp', { contact: data.contact });
          startResend();
          document.getElementById('resendBtn').disabled = true;
          document.getElementById('resendLabel').style.display = '';
        } catch (e) { showErr(e.message); }
      });

      document.getElementById('stepBtn').onclick = async () => {
        const otp = Array.from(document.querySelectorAll('.otp-input')).map(i => i.value).join('');
        if (otp.length < 6) return showErr('Enter the full 6-digit code');
        clearErr(); setLoading(true);
        try {
          const res = await apiFetch('POST', '/auth/verify-otp', { contact: data.contact, otp });
          if (res.isNew === false) {
            // Existing user verified via OTP — log them in
            localStorage.setItem('zc_token', res.token);
            onDone(res.user);
            return;
          }
          step = 4; mount();
        } catch (e) { showErr(e.message); setLoading(false); }
      };
    }

    if (step === 4) {
      document.getElementById('inPass')?.focus();
      document.getElementById('togglePass')?.addEventListener('click', () => {
        const inp = document.getElementById('inPass');
        const icon = document.querySelector('#togglePass i');
        if (inp.type === 'password') { inp.type = 'text'; icon.className = 'ti ti-eye-off'; }
        else { inp.type = 'password'; icon.className = 'ti ti-eye'; }
      });
      document.getElementById('stepBtn').onclick = () => {
        const pass = document.getElementById('inPass')?.value;
        const pass2 = document.getElementById('inPass2')?.value;
        if (!pass || pass.length < 6) return showErr('Password must be at least 6 characters');
        if (pass !== pass2) return showErr('Passwords do not match');
        data.password = pass;
        step = 5; mount();
      };
    }

    if (step === 5) {
      // Clean username live
      document.getElementById('inUsername')?.addEventListener('input', () => {
        const el = document.getElementById('inUsername');
        const pos = el.selectionStart;
        const cleaned = el.value.replace(/\s/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
        if (el.value !== cleaned) { el.value = cleaned; el.setSelectionRange(pos, pos); }
        clearErr();
      });

      document.getElementById('switchLogin')?.addEventListener('click', e => { e.preventDefault(); onLogin(); });

      document.getElementById('stepBtn').onclick = async () => {
        const username = document.getElementById('inUsername')?.value?.trim();
        if (!username || username.length < 3) return showErr('Username must be at least 3 characters');
        if (!/^[a-zA-Z0-9_]+$/.test(username)) return showErr('Only letters, numbers and underscores allowed');
        clearErr(); setLoading(true);
        try {
          const res = await apiFetch('POST', '/auth/register', {
            contact: data.contact,
            contactType: data.contactType,
            displayName: data.displayName,
            username: username.toLowerCase(),
            password: data.password
          });
          localStorage.setItem('zc_token', res.token);
          onDone(res.user);
        } catch (e) { showErr(e.message); setLoading(false); }
      };
    }
  }

  mount();
}

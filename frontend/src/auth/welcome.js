export function renderWelcome({ onRegister, onLogin }) {
  const app = document.getElementById('app');
  app.innerHTML = `
  <div class="auth-wrap" style="justify-content:space-between;padding:48px 24px 40px;">
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;">
      <div style="margin-bottom:48px;text-align:center;">
        <div style="width:72px;height:72px;background:var(--acc);border-radius:22px;display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 16px;">
          <i class="ti ti-bolt" style="color:#fff;"></i>
        </div>
        <div style="font-size:36px;font-weight:800;color:var(--panel-text);letter-spacing:-1px;">Zap<span style="color:var(--acc);">.</span></div>
        <div style="font-size:14px;color:var(--panel-text2);margin-top:8px;">Fast. Private. Secure.</div>
      </div>
    </div>
    <div style="width:100%;max-width:400px;margin:0 auto;">
      <button class="auth-btn" id="btnRegister" style="margin-bottom:12px;">
        Create new account
      </button>
      <button id="btnLogin" style="width:100%;padding:13px;background:transparent;border:1.5px solid var(--acc);color:var(--acc);border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;transition:background 0.15s;">
        Log in
      </button>
      <div style="margin-top:20px;text-align:center;font-size:12px;color:var(--panel-text2);line-height:1.6;">
        By creating an account you agree to our Terms of Service and Privacy Policy.
      </div>
    </div>
  </div>`;

  document.getElementById('btnRegister').onclick = onRegister;
  document.getElementById('btnLogin').onclick = onLogin;
}

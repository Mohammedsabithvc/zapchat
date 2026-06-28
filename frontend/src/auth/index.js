import { renderWelcome } from './welcome.js';
import { renderRegister } from './register.js';
import { renderLogin } from './login.js';

export function renderAuth(onAuth) {
  showWelcome();

  function showWelcome() {
    renderWelcome({
      onRegister: showRegister,
      onLogin: showLogin
    });
  }

  function showRegister() {
    renderRegister({
      onDone: onAuth,
      onLogin: showLogin
    });
  }

  function showLogin() {
    renderLogin({
      onDone: onAuth,
      onRegister: showRegister
    });
  }
}

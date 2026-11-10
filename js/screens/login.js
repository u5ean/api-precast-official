import { h, field, setBusy } from "../ui.js";
import { login } from "../api.js";
import { saveSession } from "../state.js";
import { go } from "../nav.js";

export function render(root) {
  const alert = h("div", { class: "alert alert-error", role: "alert", hidden: true });
  const user = field({ id: "username", label: "Epicor username", autocomplete: "username", autocapitalize: "none", spellcheck: "false" });
  const pass = field({ id: "password", label: "Password", type: "password", autocomplete: "current-password" });
  const btn = h("button", { class: "btn btn-primary btn-block", type: "submit" }, "Sign in");

  const form = h("form", {
    class: "card stack",
    novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      alert.hidden = true;
      user.setError("");
      pass.setError("");
      const username = user.input.value.trim();
      const password = pass.input.value;
      let bad = false;
      if (!username) { user.setError("Enter your Epicor username."); bad = true; }
      if (!password) { pass.setError("Enter your password."); bad = true; }
      if (bad) return;
      setBusy(btn, true, "Signing in…");
      try {
        const res = await login(username, password);
        // Only the session id, expiry and display name are kept. Never the password.
        saveSession({ sessionId: res.sessionId, expires_at: res.expires_at, username });
        pass.input.value = "";
        go("home");
      } catch (err) {
        pass.input.value = "";
        alert.textContent = err.message;
        alert.hidden = false;
        pass.input.focus();
      } finally {
        setBusy(btn, false);
      }
    },
  },
    h("p", { class: "muted" }, "Sign in with your Epicor account to receive goods."),
    alert, user.el, pass.el, btn);

  root.append(h("div", { class: "login-wrap" },
    h("h1", { class: "login-title" }, "Goods receiving"),
    form));
  user.input.focus();
  return () => {};
}

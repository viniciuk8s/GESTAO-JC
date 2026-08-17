"use strict";
(() => {
  // src/web-login.ts
  var API_BASE = window.JC_API || "http://localhost:3000";
  function qs(s) {
    return document.querySelector(s);
  }
  function erroEm(sel, msg) {
    const e = qs(sel);
    if (!e) return;
    if (msg) {
      e.textContent = msg;
      e.hidden = false;
    } else {
      e.hidden = true;
    }
  }
  async function entrar() {
    const email = (qs("#lg-email")?.value ?? "").trim();
    const senha = qs("#lg-senha")?.value ?? "";
    const btn = qs("#lg-entrar");
    erroEm("#lg-erro");
    if (!email || !senha) {
      erroEm("#lg-erro", "Informe e-mail e senha.");
      return;
    }
    if (btn) btn.disabled = true;
    try {
      const r = await fetch(`${API_BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.token) {
        erroEm("#lg-erro", j.erro || "N\xE3o foi poss\xEDvel entrar.");
        if (btn) btn.disabled = false;
        return;
      }
      localStorage.setItem("jc_token", j.token);
      localStorage.setItem("jc_user", JSON.stringify(j.user));
      location.href = "home.html";
    } catch {
      erroEm("#lg-erro", "Servidor indispon\xEDvel. Inicie a API e tente novamente.");
      if (btn) btn.disabled = false;
    }
  }
  function boot() {
    if (localStorage.getItem("jc_token")) {
      location.replace("home.html");
      return;
    }
    qs("#lg-entrar")?.addEventListener("click", () => {
      void entrar();
    });
    ["#lg-email", "#lg-senha"].forEach((s) => qs(s)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void entrar();
    }));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

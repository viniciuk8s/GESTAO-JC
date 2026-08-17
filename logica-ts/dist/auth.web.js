"use strict";
(() => {
  // src/web-auth.ts
  var API_BASE = window.JC_API || "http://localhost:3000";
  function limparESair() {
    localStorage.removeItem("jc_token");
    localStorage.removeItem("jc_user");
    location.replace("login.html");
  }
  var TOKEN = localStorage.getItem("jc_token");
  if (!TOKEN) {
    location.replace("login.html");
  }
  try {
    const cache = JSON.parse(localStorage.getItem("jc_user") || "null");
    if (cache && cache.role) document.body.classList.add("role-" + cache.role);
  } catch {
  }
  var _fetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const ehApi = url.startsWith(API_BASE) || url.includes("/api/") || url.includes("/auth/");
    let cfg = init;
    if (ehApi) {
      const headers = new Headers(init?.headers);
      const tk = localStorage.getItem("jc_token");
      if (tk && !headers.has("Authorization")) headers.set("Authorization", "Bearer " + tk);
      cfg = { ...init, headers };
    }
    return _fetch(input, cfg).then((res) => {
      if (res.status === 401 && ehApi) limparESair();
      return res;
    });
  };
  function iniciais(n) {
    const p = (n || "").trim().split(/\s+/);
    return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
  }
  function montarUsuario(u) {
    document.body.classList.remove("role-admin", "role-viewer");
    document.body.classList.add("role-" + u.role);
    const card = document.querySelector(".user-card");
    if (!card) return;
    const av = card.querySelector(".avatar");
    if (av) {
      if (u.foto) {
        av.innerHTML = `<img src="${API_BASE}${u.foto}" alt="">`;
        av.classList.add("foto");
      } else {
        av.textContent = iniciais(u.nome);
        av.classList.remove("foto");
      }
    }
    const nome = card.querySelector(".uinfo b");
    if (nome) nome.textContent = u.nome;
    const papel = card.querySelector(".uinfo small");
    if (papel) papel.textContent = u.role === "admin" ? "Administrador" : "Colaborador";
    const btn = card.querySelector(".uicon");
    if (btn && !btn.getAttribute("data-wired")) {
      btn.setAttribute("data-wired", "1");
      btn.setAttribute("title", "Sair");
      btn.addEventListener("click", limparESair);
    }
  }
  if (TOKEN) {
    void fetch(API_BASE + "/auth/me").then((r) => r.ok ? r.json() : Promise.reject(new Error("401"))).then((d) => {
      localStorage.setItem("jc_user", JSON.stringify(d.user));
      montarUsuario(d.user);
    }).catch(() => {
    });
  }
  window.JC_LOGOUT = limparESair;
  document.addEventListener("click", (e) => {
    const b = document.body;
    if (!b.classList.contains("drawer-open")) return;
    const alvo = e.target;
    if (alvo.closest(".sidebar") || alvo.closest(".menu-btn")) return;
    b.classList.remove("drawer-open");
  });
})();

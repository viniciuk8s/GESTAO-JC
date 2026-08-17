"use strict";
(() => {
  // src/web-notif.ts
  var API_BASE = window.JC_API || "http://localhost:3000";
  var dados = [];
  var naoLidas = 0;
  var criticos = 0;
  var aberto = false;
  function esc(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }
  function brl(c) {
    const neg = c < 0;
    const t = Math.abs(Math.round(c));
    const r = Math.floor(t / 100);
    const cent = t % 100;
    const s = String(r);
    let g = "";
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) g += ".";
      g += s[i];
    }
    return `${neg ? "-" : ""}R$ ${g},${String(cent).padStart(2, "0")}`;
  }
  function quando(dias) {
    if (dias < 0) return `atrasado ${-dias} ${-dias === 1 ? "dia" : "dias"}`;
    if (dias === 0) return "hoje";
    if (dias === 1) return "amanh\xE3";
    return `em ${dias} dias`;
  }
  var ICONE = { servico: "calendar-clock", pagamento: "circle-dollar-sign", documento: "file-text" };
  function icon(name) {
    return `<iconify-icon icon="ion:${name}"></iconify-icon>`;
  }
  function recalc() {
    naoLidas = dados.filter((n) => !n.lida).length;
    criticos = dados.filter((n) => !n.lida && n.severidade === "critico").length;
  }
  async function post(path, body) {
    try {
      await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch {
    }
  }
  function bell() {
    return document.querySelector(".bell");
  }
  function montar() {
    const b = bell();
    if (!b) return null;
    if (!b.querySelector(".notif-badge")) {
      b.insertAdjacentHTML("beforeend", '<span class="notif-badge" hidden></span>');
      b.setAttribute("aria-haspopup", "true");
      b.setAttribute("aria-expanded", "false");
    }
    let pop = document.getElementById("notif-pop");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "notif-pop";
      pop.className = "notif-pop";
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-label", "Notifica\xE7\xF5es");
      pop.hidden = true;
      pop.innerHTML = '<div class="notif-head"><b>Notifica\xE7\xF5es</b><div class="notif-head-r"><span class="notif-count-lbl"></span><button class="notif-read-all" type="button" hidden>Marcar todas lidas</button></div></div><div class="notif-list"></div>';
      document.body.appendChild(pop);
      pop.addEventListener("click", (e) => e.stopPropagation());
      pop.querySelector(".notif-read-all")?.addEventListener("click", () => void marcarTodas());
      const list = pop.querySelector(".notif-list");
      list?.addEventListener("click", (e) => {
        const alvo = e.target;
        const x = alvo.closest(".notif-x");
        if (x) {
          e.preventDefault();
          void dispensar(x.getAttribute("data-x") || "");
          return;
        }
        const item = alvo.closest(".notif-item");
        if (item) void abrirItem(item.getAttribute("data-id") || "", item.getAttribute("data-href") || "");
      });
      list?.addEventListener("keydown", (e) => {
        const item = e.target.closest(".notif-item");
        if (item && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          void abrirItem(item.getAttribute("data-id") || "", item.getAttribute("data-href") || "");
        }
      });
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        alternar();
      });
      document.addEventListener("click", () => {
        if (aberto) fechar();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && aberto) fechar();
      });
    }
    return pop;
  }
  function renderBadge() {
    const b = bell();
    if (!b) return;
    const badge = b.querySelector(".notif-badge");
    if (!badge) return;
    b.classList.toggle("has-notif", naoLidas > 0);
    if (naoLidas === 0) {
      badge.hidden = true;
      return;
    }
    badge.hidden = false;
    badge.textContent = naoLidas > 99 ? "99+" : String(naoLidas);
    badge.classList.toggle("crit", criticos > 0);
  }
  function renderPainel() {
    const pop = document.getElementById("notif-pop");
    if (!pop) return;
    const lbl = pop.querySelector(".notif-count-lbl");
    const ra = pop.querySelector(".notif-read-all");
    if (lbl) lbl.textContent = naoLidas ? `${naoLidas} ${naoLidas === 1 ? "n\xE3o lida" : "n\xE3o lidas"}` : dados.length ? "tudo lido" : "";
    if (ra) ra.hidden = naoLidas === 0;
    const list = pop.querySelector(".notif-list");
    if (!list) return;
    if (dados.length === 0) {
      list.innerHTML = `<div class="notif-empty">${icon("checkmark-done-outline")}<b>Tudo em dia</b><small>Nenhuma pend\xEAncia no momento.</small></div>`;
      return;
    }
    list.innerHTML = dados.map((n) => {
      const sev = n.severidade;
      const val = typeof n.valorCentavos === "number" ? `<span class="notif-val">${brl(n.valorCentavos)}</span>` : "";
      return `<div class="notif-item sev-${sev}${n.lida ? " lida" : ""}" data-id="${esc(n.id)}" data-href="${esc(n.href)}" role="link" tabindex="0" aria-label="${esc(n.titulo)}"><span class="notif-ic ${sev}">${icon(ICONE[n.tipo])}</span><div class="notif-main"><b>${esc(n.titulo)}</b><small>${esc(n.descricao)}</small></div><div class="notif-meta"><span class="notif-when ${sev}">${quando(n.dias)}</span>${val}</div><button class="notif-x" type="button" data-x="${esc(n.id)}" aria-label="Dispensar" title="Dispensar">${icon("close-outline")}</button></div>`;
    }).join("");
  }
  async function abrirItem(id, href) {
    if (!id) return;
    await post(`/api/notificacoes/${encodeURIComponent(id)}/ler`, {});
    if (href) location.href = href;
  }
  async function dispensar(id) {
    if (!id) return;
    dados = dados.filter((n) => n.id !== id);
    recalc();
    renderBadge();
    renderPainel();
    await post(`/api/notificacoes/${encodeURIComponent(id)}/dispensar`, {});
  }
  async function marcarTodas() {
    const chaves = dados.filter((n) => !n.lida).map((n) => n.id);
    if (!chaves.length) return;
    dados = dados.map((n) => ({ ...n, lida: true }));
    recalc();
    renderBadge();
    renderPainel();
    await post("/api/notificacoes/ler-todas", { chaves });
  }
  function alternar() {
    if (aberto) fechar();
    else abrir();
  }
  function abrir() {
    const pop = montar();
    if (!pop) return;
    renderPainel();
    pop.hidden = false;
    aberto = true;
    bell()?.setAttribute("aria-expanded", "true");
    bell()?.classList.add("on");
  }
  function fechar() {
    const pop = document.getElementById("notif-pop");
    if (pop) pop.hidden = true;
    aberto = false;
    bell()?.setAttribute("aria-expanded", "false");
    bell()?.classList.remove("on");
  }
  async function carregar() {
    try {
      const r = await fetch(`${API_BASE}/api/notificacoes`);
      if (!r.ok) return;
      const p = await r.json();
      dados = Array.isArray(p.notificacoes) ? p.notificacoes : [];
      recalc();
    } catch {
    }
    renderBadge();
    if (aberto) renderPainel();
  }
  function boot() {
    if (!montar()) return;
    void carregar();
    window.setInterval(() => {
      void carregar();
    }, 6e4);
    window.addEventListener("jc:mudou", () => {
      void carregar();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

"use strict";
(() => {
  // src/avatar.ts
  var API_BASE = typeof window !== "undefined" && window.JC_API || "http://localhost:3000";
  var porNome = /* @__PURE__ */ new Map();
  var carregados = [];
  function chave(nome) {
    return nome.trim().toLowerCase();
  }
  function urlArquivo(caminho) {
    const url = `${API_BASE}${caminho}`;
    if (!caminho.startsWith("/api/")) return url;
    let tk = null;
    try {
      tk = localStorage.getItem("jc_token");
    } catch {
      tk = null;
    }
    return tk ? `${url}${caminho.includes("?") ? "&" : "?"}token=${encodeURIComponent(tk)}` : url;
  }
  function iniciais(nome) {
    const p = nome.trim().split(/\s+/);
    return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
  }
  async function carregarFuncionarios() {
    try {
      const r = await fetch(`${API_BASE}/api/funcionarios`);
      if (!r.ok) return;
      carregados = await r.json();
      porNome.clear();
      for (const f of carregados) porNome.set(chave(f.nome), { foto: f.foto, cor: f.cor });
    } catch {
    }
  }
  function listaFuncionarios() {
    return carregados.map((f) => ({ ...f }));
  }

  // src/web-colab.ts
  var I = {
    cam: '<iconify-icon icon="ion:camera-outline"></iconify-icon>',
    trash: '<iconify-icon icon="ion:trash-outline"></iconify-icon>',
    off: '<iconify-icon icon="ion:cloud-offline-outline"></iconify-icon>',
    check: '<iconify-icon icon="ion:checkmark-outline"></iconify-icon>',
    users: '<iconify-icon icon="ion:people-outline"></iconify-icon>',
    layers: '<iconify-icon icon="ion:layers-outline"></iconify-icon>',
    image: '<iconify-icon icon="ion:image-outline"></iconify-icon>'
  };
  function h(t, c, html) {
    const e = document.createElement(t);
    if (c) e.className = c;
    if (html !== void 0) e.innerHTML = html;
    return e;
  }
  function qs(s) {
    return document.querySelector(s);
  }
  var online = false;
  function setStatus() {
    const el = qs("#api-status");
    if (!el) return;
    el.className = "api-pill " + (online ? "on" : "off");
    el.innerHTML = online ? `<i></i> API conectada` : `${I.off} API offline`;
  }
  var heroChart = null;
  var gaugeChart = null;
  var donutChart = null;
  var AREA_CORES = ["#ef6300", "#34d399", "#5b8def", "#fbbf24", "#a78bfa", "#fb7185"];
  function apex() {
    return window.ApexCharts;
  }
  function vis(el) {
    return !!el && el.clientWidth > 4;
  }
  function area(setor) {
    const s = setor.toLowerCase();
    if (s.includes("engenh")) return "Engenharia";
    if (s.includes("comerc")) return "Comercial";
    if (s.includes("eletricist")) return "El\xE9trica";
    if (s.includes("t\xE9cnic") || s.includes("tecnic") || s.includes("solar") || s.includes("auxiliar")) return "T\xE9cnico";
    return "Outros";
  }
  function renderPanel() {
    const funcs = listaFuncionarios();
    const total = funcs.length;
    const comFoto = funcs.filter((f) => !!f.foto).length;
    const setores = new Set(funcs.map((f) => f.setor)).size;
    const v = qs("#col-hero-val");
    const s = qs("#col-hero-sub");
    if (v) v.textContent = online ? String(total) : "\u2014";
    if (s) s.innerHTML = online ? `<b style="color:var(--pos)">${comFoto}</b> com foto \xB7 <b style="color:#fbbf24">${total - comFoto}</b> pendente${total - comFoto === 1 ? "" : "s"}` : "conecte a API para ver os dados";
    const k = qs("#col-kpis");
    if (k) k.innerHTML = online ? `<div class="sumcard card" data-tip="Total de colaboradores na equipe"><span class="si acc">${I.users}</span><div class="sc-info"><small>Colaboradores</small><b data-count="${total}" data-fmt="int" data-ck="colab-total">${total}</b></div></div><div class="sumcard card" data-tip="Colaboradores com foto cadastrada"><span class="si green">${I.cam}</span><div class="sc-info"><small>Com foto</small><b data-count="${comFoto}" data-fmt="int" data-ck="colab-foto">${comFoto}</b></div></div><div class="sumcard card" data-tip="N\xFAmero de setores distintos"><span class="si blue">${I.layers}</span><div class="sc-info"><small>Setores</small><b data-count="${setores}" data-fmt="int" data-ck="colab-setores">${setores}</b></div></div>` : "";
    const A = apex();
    if (!A || !online) return;
    const hEl = qs("#col-hero-chart");
    const heroSeries = [{ name: "Com foto", data: [comFoto] }, { name: "Pendente", data: [total - comFoto] }];
    if (heroChart) heroChart.updateSeries(heroSeries);
    else if (vis(hEl)) {
      heroChart = new A(hEl, {
        chart: { type: "bar", height: 120, stacked: true, sparkline: { enabled: true }, fontFamily: "Inter, sans-serif" },
        series: heroSeries,
        colors: ["#34d399", "#fbbf24"],
        plotOptions: { bar: { horizontal: true, barHeight: "40%", borderRadius: 5 } },
        dataLabels: { enabled: false },
        stroke: { width: 0 },
        legend: { show: true, position: "bottom", fontSize: "11px", labels: { colors: "#98a1b3" }, markers: { radius: 3 } },
        tooltip: { theme: "dark", y: { formatter: (n) => `${n} ${n === 1 ? "pessoa" : "pessoas"}` } }
      });
      heroChart.render();
    }
    const grupos = /* @__PURE__ */ new Map();
    for (const f of funcs) grupos.set(area(f.setor), (grupos.get(area(f.setor)) ?? 0) + 1);
    const areas = [...grupos.entries()].sort((a, b) => b[1] - a[1]);
    const dEl = qs("#col-donut");
    const dOpts = {
      chart: { type: "donut", height: 218, fontFamily: "Inter, sans-serif" },
      series: areas.map((a) => a[1]),
      labels: areas.map((a) => a[0]),
      colors: AREA_CORES,
      plotOptions: { pie: { donut: { size: "64%", labels: { show: true, name: { show: true, color: "#98a1b3", fontSize: "11px" }, value: { show: true, color: "#fff", fontSize: "20px", fontFamily: "Sora, sans-serif", fontWeight: 800 }, total: { show: true, label: "Equipe", color: "#98a1b3", fontSize: "11px", formatter: () => String(total) } } } } },
      dataLabels: { enabled: false },
      stroke: { width: 2, colors: ["#0c0e13"] },
      legend: { show: false },
      tooltip: { theme: "dark", y: { formatter: (n) => `${n} ${n === 1 ? "pessoa" : "pessoas"}` } }
    };
    if (donutChart) donutChart.updateOptions(dOpts);
    else if (vis(dEl)) {
      donutChart = new A(dEl, dOpts);
      donutChart.render();
    }
    const leg = qs("#col-donut-leg");
    if (leg) leg.innerHTML = areas.map((a, i) => `<div class="leg-row"><span class="leg-dot" style="background:${AREA_CORES[i % AREA_CORES.length]}"></span><span class="leg-name">${a[0]}</span><span class="leg-val">${a[1]}</span><span class="leg-pct">${Math.round(a[1] / (total || 1) * 100)}%</span></div>`).join("");
    const gEl = qs("#col-gauge");
    const pct = total > 0 ? Math.round(comFoto / total * 100) : 0;
    if (gaugeChart) gaugeChart.updateSeries([pct]);
    else if (vis(gEl)) {
      gaugeChart = new A(gEl, {
        chart: { type: "radialBar", height: 210, fontFamily: "Inter, sans-serif" },
        series: [pct],
        labels: ["com foto"],
        colors: ["#34d399"],
        plotOptions: { radialBar: {
          hollow: { size: "56%" },
          track: { background: "rgba(255,255,255,.06)" },
          dataLabels: {
            name: { show: true, color: "#98a1b3", fontSize: "11px", offsetY: 24 },
            value: { show: true, color: "#fff", fontSize: "30px", fontFamily: "Sora, sans-serif", fontWeight: 800, offsetY: -8, formatter: (n) => n + "%" }
          }
        } },
        stroke: { lineCap: "round" }
      });
      gaugeChart.render();
    }
    const gSub = qs("#col-gauge-sub");
    if (gSub) gSub.innerHTML = `<div><small>Com foto</small><b style="color:var(--pos)">${comFoto}</b></div><div><small>Pendente</small><b style="color:#fbbf24">${total - comFoto}</b></div>`;
  }
  function render() {
    setStatus();
    const grid = qs("#colab-grid");
    if (!grid) return;
    const funcs = listaFuncionarios();
    grid.innerHTML = "";
    if (!online) {
      grid.appendChild(h("div", "colab-offline card", `${I.off}<div><b>API local n\xE3o encontrada</b><p>Inicie a API para gerenciar as fotos:</p><code>cd api &amp;&amp; npm install &amp;&amp; npm run api</code><p class="dim">Sem a API, as demais telas mostram o avatar de iniciais normalmente.</p></div>`));
      return;
    }
    for (const f of funcs) {
      const card = h("div", "colab card");
      card.setAttribute("data-search", `${f.nome} ${f.setor}`.toLowerCase());
      card.setAttribute("data-sort-nome", f.nome.toLowerCase());
      card.setAttribute("data-sort-foto", f.foto ? "1" : "0");
      const av = f.foto ? `<span class="colab-av foto"><img src="${urlArquivo(f.foto)}" alt="${f.nome}"></span>` : `<span class="colab-av ${f.cor}">${iniciais(f.nome)}</span>`;
      card.innerHTML = `${av}<div class="colab-id"><b>${f.nome}</b><small>${f.setor}</small></div><div class="colab-acts"><label class="btn btn-ghost sm"><input type="file" accept="image/*" data-id="${f.id}" hidden>${I.cam} ${f.foto ? "Trocar" : "Enviar foto"}</label>` + (f.foto ? `<button class="btn btn-ghost sm danger" data-del="${f.id}" title="Remover foto">${I.trash}</button>` : "") + `</div>`;
      grid.appendChild(card);
    }
    grid.querySelectorAll("input[type=file]").forEach((inp) => {
      inp.addEventListener("change", async () => {
        const file = inp.files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.append("foto", file);
        try {
          await fetch(`${API_BASE}/api/funcionarios/${inp.dataset.id}/foto`, { method: "POST", body: fd });
        } catch {
        }
        await reload();
        toast("Foto atualizada \u2014 j\xE1 vale em todas as se\xE7\xF5es");
      });
    });
    grid.querySelectorAll("[data-del]").forEach((b) => {
      b.addEventListener("click", async () => {
        try {
          await fetch(`${API_BASE}/api/funcionarios/${b.getAttribute("data-del")}/foto`, { method: "DELETE" });
        } catch {
        }
        await reload();
        toast("Foto removida");
      });
    });
  }
  async function reload() {
    await carregarFuncionarios();
    online = listaFuncionarios().length > 0;
    render();
    renderPanel();
  }
  function toast(msg) {
    let t = qs("#colab-toast");
    if (!t) {
      t = h("div", "toast", `${I.check}<span></span>`);
      t.id = "colab-toast";
      document.body.appendChild(t);
    }
    t.querySelector("span").textContent = msg;
    document.body.classList.add("toast-open");
    window.setTimeout(() => document.body.classList.remove("toast-open"), 2600);
  }
  async function boot() {
    await reload();
    window.setInterval(() => {
      void reload();
    }, 6e4);
    window.addEventListener("jc:mudou", () => {
      void reload();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else void boot();
})();

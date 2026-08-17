"use strict";
(() => {
  // src/web-proj.ts
  var API_BASE = typeof window !== "undefined" && window.JC_API || "http://localhost:3000";
  var I = {
    solar: '<iconify-icon icon="ion:sunny-outline"></iconify-icon>',
    fotov: '<iconify-icon icon="ion:flash-outline"></iconify-icon>',
    manut: '<iconify-icon icon="ion:construct-outline"></iconify-icon>',
    eletr: '<iconify-icon icon="ion:flash-outline"></iconify-icon>',
    vistoria: '<iconify-icon icon="ion:search-outline"></iconify-icon>',
    outro: '<iconify-icon icon="ion:folder-outline"></iconify-icon>',
    wallet: '<iconify-icon icon="ion:wallet-outline"></iconify-icon>',
    building: '<iconify-icon icon="ion:business-outline"></iconify-icon>',
    briefcase: '<iconify-icon icon="ion:briefcase-outline"></iconify-icon>',
    check: '<iconify-icon icon="ion:checkmark-outline"></iconify-icon>',
    clock: '<iconify-icon icon="ion:time-outline"></iconify-icon>',
    user: '<iconify-icon icon="ion:person-outline"></iconify-icon>',
    pin: '<iconify-icon icon="ion:location-outline"></iconify-icon>',
    cal: '<iconify-icon icon="ion:calendar-outline"></iconify-icon>',
    file: '<iconify-icon icon="ion:document-text-outline"></iconify-icon>',
    arrowIn: '<iconify-icon icon="ion:trending-down-outline"></iconify-icon>',
    arrowOut: '<iconify-icon icon="ion:trending-up-outline"></iconify-icon>',
    chevr: '<iconify-icon icon="ion:chevron-forward-outline"></iconify-icon>',
    off: '<iconify-icon icon="ion:cloud-offline-outline"></iconify-icon>',
    edit: '<iconify-icon icon="ion:create-outline"></iconify-icon>',
    trash: '<iconify-icon icon="ion:trash-outline"></iconify-icon>',
    plus: '<iconify-icon icon="ion:add-outline"></iconify-icon>'
  };
  var projetos = [];
  var filtro = "";
  var online = false;
  var editId = null;
  function apex() {
    return window.ApexCharts;
  }
  function reais(c) {
    return Math.round(c / 100);
  }
  function moneyK(v) {
    return Math.abs(v) >= 1e3 ? "R$ " + (v / 1e3).toFixed(0) + "k" : "R$ " + v;
  }
  function moneyFull(v) {
    return "R$ " + Number(v).toLocaleString("pt-BR");
  }
  var AXIS = { colors: "#6b7385", fontSize: "10px", fontWeight: 600 };
  var ST_ORDER = ["orcamento", "em_andamento", "concluido", "cancelado"];
  var ST_COR = { orcamento: "#fbbf24", em_andamento: "#5b8def", concluido: "#34d399", cancelado: "#f87171" };
  var heroChart = null;
  var stChart = null;
  var finChart = null;
  function qs(s) {
    return document.querySelector(s);
  }
  function esc(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }
  function brl(c) {
    const neg = c < 0;
    const total = Math.abs(Math.trunc(c));
    const reais2 = Math.floor(total / 100);
    const cent = total % 100;
    const s = String(reais2);
    let g = "";
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) g += ".";
      g += s[i];
    }
    return `${neg ? "-" : ""}R$ ${g},${String(cent).padStart(2, "0")}`;
  }
  function brlk(c) {
    return c >= 1e5 ? `R$ ${(c / 1e5).toFixed(1).replace(".", ",")} mil` : brl(c);
  }
  function hojeISO() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(/* @__PURE__ */ new Date());
  }
  function fmtData(iso) {
    if (!iso) return "\u2014";
    const p = iso.split("-");
    return `${p[2]}/${p[1]}/${p[0]}`;
  }
  var STATUS_LABEL = { orcamento: "Or\xE7amento", em_andamento: "Em andamento", concluido: "Conclu\xEDdo", cancelado: "Cancelado" };
  var STATUS_CLS = { orcamento: "amber", em_andamento: "blue", concluido: "green", cancelado: "red" };
  var TIPO_LABEL = { instalacao_solar: "Instala\xE7\xE3o solar", projeto_fotovoltaico: "Projeto fotovoltaico", manutencao: "Manuten\xE7\xE3o", eletrica_predial: "El\xE9trica predial", vistoria: "Vistoria", outro: "Outro" };
  var TIPO_ICON = { instalacao_solar: I.solar, projeto_fotovoltaico: I.fotov, manutencao: I.manut, eletrica_predial: I.eletr, vistoria: I.vistoria, outro: I.outro };
  var TIPO_ICLS = { instalacao_solar: "orange", projeto_fotovoltaico: "amber", manutencao: "blue", eletrica_predial: "violet", vistoria: "green", outro: "slate" };
  function card(p) {
    const r = p.resumo;
    return `<div class="proj-card card" data-id="${p.id}" data-search="${esc(`${p.nome} ${p.cliente} ${p.responsavel}`.toLowerCase())}" data-sort-nome="${esc(p.nome.toLowerCase())}" data-sort-valor="${r.contratadoCentavos}" data-sort-prog="${p.progresso}">
    <div class="proj-top">
      <span class="proj-ic ${TIPO_ICLS[p.tipo]}">${TIPO_ICON[p.tipo]}</span>
      <div class="proj-id"><b>${esc(p.nome)}</b><small>${esc(p.cliente)} \xB7 ${esc(p.responsavel)}</small></div>
      <span class="pstatus ${STATUS_CLS[p.status]}">${STATUS_LABEL[p.status]}</span>
    </div>
    <div class="proj-prog">
      <div class="pp-track"><div class="pp-fill ${STATUS_CLS[p.status]}" style="width:${p.progresso}%"></div></div>
      <span class="pp-pct">${p.progresso}%</span>
    </div>
    <div class="proj-fin">
      <div><small>Contratado</small><b>${brl(r.contratadoCentavos)}</b></div>
      <div><small>Recebido</small><b class="pos">${brl(r.recebidoCentavos)}</b></div>
      <div><small>A receber</small><b>${brl(r.aReceberCentavos)}</b></div>
    </div>
    <div class="proj-foot"><span>${I.cal}${r.nAgendamentos} servi\xE7o(s)</span><span>${I.file}${r.nDocumentos} documento(s)</span></div>
  </div>`;
  }
  function renderList() {
    const el = qs("#proj-list");
    if (!el) return;
    if (!online) {
      el.innerHTML = `<div class="colab-offline">${I.off}<div><b>API local n\xE3o encontrada</b><p>Inicie a API para ver e gerir os projetos:</p><code>cd logica-ts &amp;&amp; npm install &amp;&amp; npm run api</code><p class="dim">Sem a API, esta se\xE7\xE3o fica vazia; as demais telas seguem funcionando.</p></div></div>`;
      return;
    }
    const lista = filtro ? projetos.filter((p) => p.status === filtro) : projetos;
    if (lista.length === 0) {
      el.innerHTML = `<div class="day-empty">${I.briefcase}<p>Nenhum projeto ${filtro ? "neste status" : "ainda"}.<br>Use <b>Novo projeto</b> para come\xE7ar.</p></div>`;
      return;
    }
    el.innerHTML = lista.map(card).join("");
  }
  function renderResumo() {
    const el = qs("#proj-sum");
    if (!el) return;
    if (!online) {
      el.innerHTML = "";
      return;
    }
    const emand = projetos.filter((p) => p.status === "em_andamento").length;
    const contratado = projetos.reduce((s, p) => s + p.resumo.contratadoCentavos, 0);
    const aReceber = projetos.reduce((s, p) => s + p.resumo.aReceberCentavos, 0);
    el.innerHTML = `<div class="sumcard card" data-tip="Total de obras cadastradas"><span class="si acc">${I.briefcase}</span><div class="sc-info"><small>Projetos</small><b data-count="${projetos.length}" data-fmt="int" data-ck="proj-total">${projetos.length}</b></div></div><div class="sumcard card" data-tip="Obras em execu\xE7\xE3o"><span class="si blue">${I.clock}</span><div class="sc-info"><small>Em andamento</small><b data-count="${emand}" data-fmt="int" data-ck="proj-emand">${emand}</b></div></div><div class="sumcard card" data-tip="Valor total contratado das obras"><span class="si green">${I.wallet}</span><div class="sc-info"><small>Contratado</small><b data-count="${contratado}" data-fmt="moedak" data-ck="proj-contratado">${brlk(contratado)}</b></div></div><div class="sumcard card" data-tip="Saldo a receber das obras"><span class="si amber">${I.arrowIn}</span><div class="sc-info"><small>A receber</small><b data-count="${aReceber}" data-fmt="moedak" data-ck="proj-areceber">${brlk(aReceber)}</b></div></div>`;
    const counts = qs("#proj-count");
    if (counts) counts.textContent = String(projetos.length);
  }
  function setStatus() {
    const el = qs("#api-status");
    if (!el) return;
    el.className = "api-pill " + (online ? "on" : "off");
    el.innerHTML = online ? `<i></i> API conectada` : `${I.off} API offline`;
  }
  function renderHero() {
    const v = qs("#proj-hero-val");
    const s = qs("#proj-hero-sub");
    const C = projetos.reduce((a, p) => a + p.resumo.contratadoCentavos, 0);
    const R = projetos.reduce((a, p) => a + p.resumo.recebidoCentavos, 0);
    const AR = projetos.reduce((a, p) => a + p.resumo.aReceberCentavos, 0);
    if (!online) {
      if (v) v.textContent = "R$ \u2014";
      if (s) s.textContent = "conecte a API para ver os dados";
      return;
    }
    if (v) v.textContent = brl(C);
    if (s) s.innerHTML = `recebido <b style="color:var(--pos)">${brl(R)}</b> \xB7 a receber <b style="color:var(--accent-2)">${brl(AR)}</b>`;
  }
  function renderCharts() {
    const A = apex();
    if (!A || !online) return;
    const hEl = qs("#proj-hero-chart");
    if (hEl) {
      const R = reais(projetos.reduce((a, p) => a + p.resumo.recebidoCentavos, 0));
      const AR = reais(projetos.reduce((a, p) => a + p.resumo.aReceberCentavos, 0));
      const series = [{ name: "Recebido", data: [R] }, { name: "A receber", data: [AR] }];
      if (heroChart) heroChart.updateSeries(series);
      else {
        heroChart = new A(hEl, {
          chart: { type: "bar", height: 96, stacked: true, toolbar: { show: false }, sparkline: { enabled: true }, fontFamily: "Inter, sans-serif" },
          series,
          colors: ["#34d399", "#ff8a3d"],
          plotOptions: { bar: { horizontal: true, borderRadius: 5, barHeight: "44%" } },
          dataLabels: { enabled: false },
          legend: { show: false },
          tooltip: { theme: "dark", y: { formatter: (v) => moneyFull(v) } }
        });
        heroChart.render();
      }
    }
    const sEl = qs("#proj-status");
    if (sEl) {
      const counts = ST_ORDER.map((st) => projetos.filter((p) => p.status === st).length);
      const cats = ST_ORDER.map((st) => STATUS_LABEL[st]);
      const opts = {
        chart: { type: "bar", height: 200, toolbar: { show: false }, fontFamily: "Inter, sans-serif" },
        series: [{ name: "Obras", data: counts }],
        colors: ST_ORDER.map((st) => ST_COR[st]),
        plotOptions: { bar: { columnWidth: "46%", borderRadius: 8, borderRadiusApplication: "end", distributed: true } },
        fill: { type: "gradient", gradient: { shade: "light", type: "vertical", shadeIntensity: 0.18, opacityFrom: 1, opacityTo: 0.82, stops: [0, 100] } },
        dataLabels: { enabled: true, style: { colors: ["#fff"], fontWeight: 700 } },
        legend: { show: false },
        xaxis: { categories: cats, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
        yaxis: { labels: { style: AXIS }, tickAmount: 3 },
        grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 4 },
        tooltip: { theme: "dark" }
      };
      if (stChart) stChart.updateOptions(opts);
      else {
        stChart = new A(sEl, opts);
        stChart.render();
      }
      const m = qs("#proj-st-meta");
      if (m) m.textContent = `${projetos.length} no total`;
    }
    const fEl = qs("#proj-fin-chart");
    if (fEl) {
      const cats = projetos.map((p) => p.cliente);
      const series = [
        { name: "Recebido", data: projetos.map((p) => reais(p.resumo.recebidoCentavos)) },
        { name: "A receber", data: projetos.map((p) => reais(p.resumo.aReceberCentavos)) }
      ];
      if (finChart) finChart.updateOptions({ series, xaxis: { categories: cats } });
      else {
        finChart = new A(fEl, {
          chart: { type: "bar", height: 200, stacked: true, toolbar: { show: false }, fontFamily: "Inter, sans-serif" },
          series,
          colors: ["#34d399", "#ff8a3d"],
          plotOptions: { bar: { columnWidth: "50%", borderRadius: 6, borderRadiusApplication: "end" } },
          dataLabels: { enabled: false },
          xaxis: { categories: cats, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS, trim: true, hideOverlappingLabels: true } },
          yaxis: { labels: { formatter: (v) => moneyK(v), style: AXIS } },
          grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 4 },
          legend: { show: true, position: "top", horizontalAlign: "right", fontSize: "12px", labels: { colors: "#98a1b3" }, markers: { radius: 4 } },
          tooltip: { theme: "dark", y: { formatter: (v) => moneyFull(v) } }
        });
        finChart.render();
      }
    }
  }
  async function carregar() {
    try {
      const r = await fetch(`${API_BASE}/api/projetos`);
      if (!r.ok) throw new Error("api");
      projetos = await r.json();
      online = true;
    } catch {
      online = false;
    }
    setStatus();
    renderResumo();
    renderList();
    renderHero();
    renderCharts();
  }
  function linhaAg(a) {
    return `<div class="arow"><span class="doc-ic blue">${I.cal}</span><div class="rmid"><b>${esc(a.titulo)}</b><small>${fmtData(a.data)} \xB7 ${esc(a.inicio)} \xB7 ${esc(a.tecnico)}</small></div><span class="a-val">${brl(a.valorCentavos)}</span></div>`;
  }
  function linhaDoc(d) {
    return `<div class="arow"><span class="doc-ic violet">${I.file}</span><div class="rmid"><b>${esc(d.titulo)}</b><small>${esc(d.tipo)}${d.emissao ? " \xB7 " + fmtData(d.emissao) : ""}</small></div>${d.valorCentavos != null ? `<span class="a-val">${brl(d.valorCentavos)}</span>` : ""}</div>`;
  }
  function linhaMov(m) {
    const inn = m.tipo === "entrada";
    return `<div class="arow"><span class="doc-ic ${inn ? "green" : "orange"}">${inn ? I.arrowIn : I.arrowOut}</span><div class="rmid"><b>${esc(m.descricao)}</b><small>${esc(m.categoria)} \xB7 ${fmtData(m.data)}</small></div><span class="a-val ${inn ? "pos" : "neg"}">${inn ? "+ " : "\u2212 "}${brl(m.valorCentavos)}</span></div>`;
  }
  async function abrirDetalhe(id) {
    let d;
    try {
      const r2 = await fetch(`${API_BASE}/api/projetos/${id}`);
      if (!r2.ok) throw new Error();
      d = await r2.json();
    } catch {
      toast("N\xE3o foi poss\xEDvel abrir o projeto");
      return;
    }
    const p = d.projeto;
    const r = d.resumo;
    const set = (sel, html) => {
      const e = qs(sel);
      if (e) e.innerHTML = html;
    };
    const t = qs("#projd-title");
    if (t) t.textContent = p.nome;
    set(
      "#projd-head",
      `<span class="pstatus ${STATUS_CLS[p.status]}">${STATUS_LABEL[p.status]}</span><span class="projd-tag">${TIPO_LABEL[p.tipo]}</span><span class="projd-tag">${I.user}${esc(p.responsavel)}</span>` + (p.endereco ? `<span class="projd-tag">${I.pin}${esc(p.endereco)}</span>` : "") + `<span class="projd-tag">${I.cal}${fmtData(p.inicio)} \u2192 ${fmtData(p.previsao)}</span>`
    );
    set("#projd-prog", `<div class="pp-track"><div class="pp-fill ${STATUS_CLS[p.status]}" style="width:${p.progresso}%"></div></div><span class="pp-pct">${p.progresso}% conclu\xEDdo</span>`);
    set(
      "#projd-fin",
      `<div class="pf"><small>Contratado</small><b>${brl(r.contratadoCentavos)}</b></div><div class="pf"><small>Recebido</small><b class="pos">${brl(r.recebidoCentavos)}</b></div><div class="pf"><small>A receber</small><b>${brl(r.aReceberCentavos)}</b></div><div class="pf"><small>Custo</small><b class="neg">${brl(r.custoCentavos)}</b></div><div class="pf"><small>Saldo da obra</small><b>${brl(r.saldoCentavos)}</b></div>`
    );
    set("#projd-ags", d.agendamentos.length ? d.agendamentos.map(linhaAg).join("") : `<div class="dp-sub">Nenhum servi\xE7o vinculado.</div>`);
    set("#projd-docs", d.documentos.length ? d.documentos.map(linhaDoc).join("") : `<div class="dp-sub">Nenhum documento vinculado.</div>`);
    set("#projd-movs", d.movimentacoes.length ? d.movimentacoes.map(linhaMov).join("") : `<div class="dp-sub">Nenhuma movimenta\xE7\xE3o vinculada.</div>`);
    const del = qs("#projd-del");
    if (del) del.setAttribute("data-id", p.id);
    const ed = qs("#projd-edit");
    if (ed) ed.setAttribute("data-id", p.id);
    openModal("projdet");
  }
  function setV(sel, val) {
    const e = qs(sel);
    if (e) e.value = val;
  }
  function abrirNovo(p) {
    editId = p ? p.id : null;
    const title = qs("#pnovo-title");
    if (title) title.textContent = p ? "Editar projeto" : "Novo projeto";
    setV("#proj-nome", p ? p.nome : "");
    setV("#proj-cliente", p ? p.cliente : "");
    setV("#proj-tipo", p ? p.tipo : "instalacao_solar");
    setV("#proj-status", p ? p.status : "orcamento");
    setV("#proj-resp", p ? p.responsavel : "");
    setV("#proj-endereco", p && p.endereco ? p.endereco : "");
    setV("#proj-valor", p ? brl(p.valorContratadoCentavos).replace("R$ ", "") : "");
    setV("#proj-inicio", p && p.inicio ? p.inicio : hojeISO());
    setV("#proj-previsao", p && p.previsao ? p.previsao : "");
    setV("#proj-progresso", p ? String(p.progresso) : "0");
    setV("#proj-obs", p && p.obs ? p.obs : "");
    const erro = qs("#proj-erro");
    if (erro) erro.hidden = true;
    openModal("projnovo");
  }
  function valorCentavos(v) {
    const n = parseFloat(v.trim().replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  async function salvar() {
    const val = (sel) => qs(sel)?.value ?? "";
    const corpo = {
      nome: val("#proj-nome"),
      cliente: val("#proj-cliente"),
      tipo: val("#proj-tipo"),
      status: val("#proj-status"),
      responsavel: val("#proj-resp"),
      endereco: val("#proj-endereco") || void 0,
      valorContratadoCentavos: valorCentavos(val("#proj-valor")),
      inicio: val("#proj-inicio") || void 0,
      previsao: val("#proj-previsao") || void 0,
      progresso: Math.max(0, Math.min(100, Math.round(Number(val("#proj-progresso")) || 0))),
      obs: val("#proj-obs") || void 0
    };
    const erro = qs("#proj-erro");
    try {
      const url = editId ? `${API_BASE}/api/projetos/${editId}` : `${API_BASE}/api/projetos`;
      const r = await fetch(url, { method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        if (erro) {
          erro.textContent = j.erros && j.erros.join(" ") || "N\xE3o foi poss\xEDvel salvar.";
          erro.hidden = false;
        }
        return;
      }
    } catch {
      if (erro) {
        erro.textContent = "API offline \u2014 inicie a API para gerir projetos.";
        erro.hidden = false;
      }
      return;
    }
    closeAll();
    await carregar();
    toast(editId ? "Projeto atualizado" : "Projeto criado com sucesso");
  }
  async function remover(id) {
    try {
      await fetch(`${API_BASE}/api/projetos/${id}`, { method: "DELETE" });
    } catch {
    }
    closeAll();
    await carregar();
    toast("Projeto removido");
  }
  var MODS = ["projdet", "projnovo"];
  function closeAll() {
    MODS.forEach((k) => document.body.classList.remove(k + "-open"));
  }
  function openModal(id) {
    closeAll();
    document.body.classList.add(id + "-open");
  }
  var tt = 0;
  function toast(msg) {
    const s = qs(".toast .tmsg") ?? qs(".toast span");
    if (s && msg) s.textContent = msg;
    document.body.classList.add("toast-open");
    window.clearTimeout(tt);
    tt = window.setTimeout(() => document.body.classList.remove("toast-open"), 2600);
  }
  function wire() {
    const b = document.body;
    const mb = qs(".menu-btn");
    if (mb) mb.addEventListener("click", () => b.classList.toggle("drawer-open"));
    const ov = qs(".drawer-overlay");
    if (ov) ov.addEventListener("click", () => b.classList.remove("drawer-open"));
    document.querySelectorAll("[data-open]").forEach((el) => el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (el.getAttribute("data-open") === "projnovo") abrirNovo();
      else openModal(el.getAttribute("data-open") ?? "");
    }));
    document.querySelectorAll(".mclose,[data-close]").forEach((el) => el.addEventListener("click", closeAll));
    document.querySelectorAll(".modal-wrap").forEach((w) => w.addEventListener("click", (e) => {
      if (e.target === w) closeAll();
    }));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeAll();
        b.classList.remove("drawer-open");
      }
    });
    document.querySelectorAll(".chips").forEach((g) => g.addEventListener("click", (e) => {
      const c = e.target.closest(".chipf");
      if (!c) return;
      g.querySelectorAll(".chipf").forEach((x) => x.classList.remove("on"));
      c.classList.add("on");
      filtro = c.getAttribute("data-status") ?? "";
      renderList();
    }));
    const save = qs("#proj-save");
    if (save) save.addEventListener("click", () => {
      void salvar();
    });
    const list = qs("#proj-list");
    if (list) list.addEventListener("click", (e) => {
      const c = e.target.closest(".proj-card");
      if (c) void abrirDetalhe(c.getAttribute("data-id") ?? "");
    });
    const del = qs("#projd-del");
    if (del) del.addEventListener("click", () => {
      void remover(del.getAttribute("data-id") ?? "");
    });
    const ed = qs("#projd-edit");
    if (ed) ed.addEventListener("click", () => {
      const p = projetos.find((x) => x.id === ed.getAttribute("data-id"));
      if (p) abrirNovo(p);
    });
  }
  async function boot() {
    wire();
    await carregar();
    window.setInterval(() => {
      void carregar();
    }, 6e4);
    window.addEventListener("jc:mudou", () => {
      void carregar();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => {
    void boot();
  });
  else void boot();
})();

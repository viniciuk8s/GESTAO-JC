"use strict";
(() => {
  // src/web-home.ts
  var API_BASE = typeof window !== "undefined" && window.JC_API || "http://localhost:3000";
  var I = {
    wallet: '<iconify-icon icon="ion:wallet-outline"></iconify-icon>',
    arrowIn: '<iconify-icon icon="ion:trending-down-outline"></iconify-icon>',
    arrowOut: '<iconify-icon icon="ion:trending-up-outline"></iconify-icon>',
    cal: '<iconify-icon icon="ion:calendar-outline"></iconify-icon>',
    zap: '<iconify-icon icon="ion:flash-outline"></iconify-icon>',
    landmark: '<iconify-icon icon="ion:library-outline"></iconify-icon>',
    alert: '<iconify-icon icon="ion:warning-outline"></iconify-icon>',
    file: '<iconify-icon icon="ion:document-text-outline"></iconify-icon>',
    users: '<iconify-icon icon="ion:people-outline"></iconify-icon>',
    pin: '<iconify-icon icon="ion:location-outline"></iconify-icon>',
    clock: '<iconify-icon icon="ion:time-outline"></iconify-icon>',
    off: '<iconify-icon icon="ion:cloud-offline-outline"></iconify-icon>',
    check: '<iconify-icon icon="ion:checkmark-outline"></iconify-icon>'
  };
  var resumo = null;
  var movs = [];
  var projetos = [];
  var ags = [];
  var docsVenc = [];
  var obrig = [];
  var online = false;
  function qs(s) {
    return document.querySelector(s);
  }
  function esc(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }
  function brl(c) {
    const neg = c < 0;
    const total = Math.abs(Math.trunc(c));
    const r = Math.floor(total / 100);
    const cent = total % 100;
    const s = String(r);
    let g = "";
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) g += ".";
      g += s[i];
    }
    return `${neg ? "-" : ""}R$ ${g},${String(cent).padStart(2, "0")}`;
  }
  function brlk(c) {
    const v = c / 100;
    return Math.abs(v) >= 1e3 ? `R$ ${(v / 1e3).toFixed(1).replace(".", ",")} mil` : brl(c);
  }
  function fmtDia(iso) {
    const p = iso.split("-");
    return `${p[2]}/${p[1]}`;
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
  function apex() {
    return window.ApexCharts;
  }
  var flowChart = null;
  var projChart = null;
  var barsChart = null;
  function serieFluxo() {
    const asc = [...movs].sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
    const byDay = /* @__PURE__ */ new Map();
    let s = 0;
    for (const m of asc) {
      s += m.tipo === "entrada" ? m.valorCentavos : -m.valorCentavos;
      byDay.set(m.data, s);
    }
    return [...byDay.entries()].map(([d, v]) => ({ x: (/* @__PURE__ */ new Date(d + "T00:00:00")).getTime(), y: reais(v) }));
  }
  function porDia() {
    const map = /* @__PURE__ */ new Map();
    for (const m of movs) {
      const e = map.get(m.data) ?? { ent: 0, sai: 0 };
      if (m.tipo === "entrada") e.ent += m.valorCentavos;
      else e.sai += m.valorCentavos;
      map.set(m.data, e);
    }
    const ks = [...map.keys()].sort();
    return { dias: ks.map(fmtDia), ent: ks.map((k) => reais(map.get(k).ent)), sai: ks.map((k) => reais(map.get(k).sai)) };
  }
  var STATUS_LABEL = { orcamento: "Or\xE7amento", em_andamento: "Em andamento", concluido: "Conclu\xEDdo", cancelado: "Cancelado" };
  var STATUS_ORDER = ["orcamento", "em_andamento", "concluido", "cancelado"];
  var STATUS_COR = { orcamento: "#fbbf24", em_andamento: "#5b8def", concluido: "#34d399", cancelado: "#f87171" };
  function setStatus() {
    const el = qs("#api-status");
    if (!el) return;
    el.className = "api-pill " + (online ? "on" : "off");
    el.innerHTML = online ? `<i></i> API conectada` : `${I.off} API offline`;
  }
  var reduzMov = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var prevSaldo = null;
  function flash(el) {
    if (!el || reduzMov) return;
    el.classList.remove("flash-live");
    void el.offsetWidth;
    el.classList.add("flash-live");
  }
  function mostrarSkeletons() {
    const v = qs("#h-saldo");
    if (v) {
      v.classList.add("skeleton");
      v.textContent = "R$ 00.000,00";
    }
    const k = qs("#h-kpis");
    if (k) k.innerHTML = Array.from({ length: 4 }).map(() => `<div class="sumcard card"><span class="si skeleton" style="border:0"></span><div class="sc-info"><small class="skeleton" style="display:block;width:74px;height:10px"></small><b class="skeleton" style="display:inline-block;width:88px;height:20px;margin-top:7px"></b></div></div>`).join("");
    const f = qs("#h-feed");
    if (f) f.innerHTML = Array.from({ length: 3 }).map(() => `<div class="feed-row"><span class="feed-ic skeleton"></span><div class="feed-body"><b class="skeleton" style="display:block;width:70%;height:12px"></b><small class="skeleton" style="display:block;width:42%;height:10px;margin-top:6px"></small></div></div>`).join("");
  }
  function renderHero() {
    const v = qs("#h-saldo");
    const s = qs("#h-saldo-sub");
    if (!resumo || !online) {
      if (v) {
        v.classList.remove("skeleton");
        v.textContent = "R$ \u2014";
      }
      if (s) s.textContent = "conecte a API para ver os dados";
      return;
    }
    if (v) {
      v.classList.remove("skeleton");
      if (prevSaldo !== null && prevSaldo !== resumo.saldoCentavos) flash(v);
      prevSaldo = resumo.saldoCentavos;
      v.textContent = brl(resumo.saldoCentavos);
      v.setAttribute("data-count", String(resumo.saldoCentavos));
      v.setAttribute("data-fmt", "moeda");
      v.setAttribute("data-ck", "home-saldo");
    }
    if (s) s.innerHTML = `entradas <b style="color:var(--pos)">${brl(resumo.entradasCentavos)}</b> \xB7 sa\xEDdas <b style="color:var(--neg)">${brl(resumo.saidasCentavos)}</b>`;
  }
  function renderKpis() {
    const el = qs("#h-kpis");
    if (!el) return;
    if (!online) {
      el.innerHTML = "";
      return;
    }
    const ativos = projetos.filter((p) => p.status === "em_andamento").length;
    const impostos = obrig.filter((o) => !o.pago).reduce((s, o) => s + o.valorCentavos, 0);
    const confirmados = ags.filter((a) => a.situacao === "confirmado").length;
    const aReceber = resumo ? resumo.aReceberCentavos : 0;
    el.innerHTML = `<div class="sumcard card" data-tip="Total a receber de obras e servi\xE7os em aberto"><span class="si green">${I.arrowIn}</span><div class="sc-info"><small>A receber</small><b data-count="${aReceber}" data-fmt="moedak" data-ck="home-areceber">${brlk(aReceber)}</b></div></div><div class="sumcard card" data-tip="Obras com status \u201CEm andamento\u201D"><span class="si acc">${I.zap}</span><div class="sc-info"><small>Projetos ativos</small><b data-count="${ativos}" data-fmt="int" data-ck="home-proj-ativos">${ativos}</b></div></div><div class="sumcard card" data-tip="Servi\xE7os na agenda"><span class="si blue">${I.cal}</span><div class="sc-info"><small>Servi\xE7os agendados</small><b data-count="${ags.length}" data-fmt="int" data-ck="home-ags">${ags.length}</b></div></div><div class="sumcard card" data-tip="Impostos e obriga\xE7\xF5es fiscais ainda n\xE3o pagos"><span class="si amber">${I.landmark}</span><div class="sc-info"><small>Impostos a pagar</small><b data-count="${impostos}" data-fmt="moedak" data-ck="home-impostos">${brlk(impostos)}</b></div></div>`;
    const am = qs("#h-ag-meta");
    if (am) am.textContent = `${ags.length} no total \xB7 ${confirmados} confirmados`;
    const pm = qs("#h-proj-meta");
    if (pm) pm.textContent = `${projetos.length} obras`;
  }
  function renderProximos() {
    const el = qs("#h-ag");
    if (!el) return;
    if (!online) {
      el.innerHTML = `<div class="colab-offline">${I.off}<div><b>API local n\xE3o encontrada</b><p>Inicie a API para ver o painel ao vivo:</p><code>cd logica-ts &amp;&amp; npm run api</code></div></div>`;
      return;
    }
    const lista = [...ags].sort((a, b) => a.data > b.data ? -1 : a.data < b.data ? 1 : a.inicio > b.inicio ? -1 : 1).slice(0, 5);
    if (lista.length === 0) {
      el.innerHTML = `<div class="dp-sub">Nenhum servi\xE7o agendado.</div>`;
      return;
    }
    el.innerHTML = lista.map((a) => {
      const p = a.data.split("-");
      const st = a.situacao === "confirmado" ? "ok" : a.situacao === "pendente" ? "wait" : a.situacao === "concluido" ? "ok" : "bad";
      return `<div class="row ag-row" data-id="${esc(a.id)}" role="button" tabindex="0"><div class="datechip"><b>${Number(p[2])}</b><small>${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(p[1]) - 1]}</small></div><div class="rmid"><b>${esc(a.titulo)}</b><small>${esc(a.cliente)} \xB7 ${esc(a.inicio)}</small></div><span class="pill ${st}">${a.valorCentavos > 0 ? brl(a.valorCentavos) : "\u2014"}</span></div>`;
    }).join("");
  }
  function renderAlertas() {
    const el = qs("#h-alertas");
    if (!el) return;
    if (!online) {
      el.innerHTML = "";
      return;
    }
    const linhas = [];
    for (const d of docsVenc.slice(0, 4)) {
      linhas.push(`<div class="arow"><span class="doc-ic amber">${I.alert}</span><div class="rmid"><b>${esc(d.titulo)}</b><small>${d.vinculoLabel ? esc(d.vinculoLabel) + " \xB7 " : ""}vence ${d.vencimento ? fmtDia(d.vencimento) : ""}</small></div></div>`);
    }
    const naoPagas = obrig.filter((o) => !o.pago);
    for (const o of naoPagas.slice(0, 3)) {
      const venc = o.status === "vencido";
      linhas.push(`<div class="arow"><span class="doc-ic ${venc ? "orange" : "blue"}">${I.landmark}</span><div class="rmid"><b>${esc(o.descricao)}</b><small>vence ${fmtDia(o.vencimento)}${venc ? " \xB7 vencido" : ""}</small></div><span class="a-val">${brl(o.valorCentavos)}</span></div>`);
    }
    el.innerHTML = linhas.length ? linhas.join("") : `<div class="dp-sub"><span style="color:var(--pos)">${I.check}</span> Nenhum vencimento nos pr\xF3ximos 30 dias.</div>`;
  }
  function renderCharts() {
    const A = apex();
    if (!A || !online) return;
    const fEl = qs("#h-flow");
    if (fEl && resumo) {
      const data = serieFluxo();
      if (flowChart) flowChart.updateSeries([{ name: "Saldo", data }]);
      else {
        flowChart = new A(fEl, {
          chart: { type: "area", height: 160, toolbar: { show: false }, animations: { enabled: true, easing: "easeinout", speed: 700 }, parentHeightOffset: 0, fontFamily: "Inter, sans-serif", dropShadow: { enabled: true, top: 5, left: 0, blur: 6, opacity: 0.22, color: "#ff8a3d" } },
          series: [{ name: "Saldo", data }],
          xaxis: { type: "datetime", axisBorder: { show: false }, axisTicks: { show: false }, labels: { datetimeFormatter: { day: "dd/MM" }, style: AXIS } },
          yaxis: { labels: { formatter: (v) => moneyK(v), style: AXIS }, tickAmount: 3 },
          stroke: { curve: "smooth", width: 3 },
          colors: ["#ff8a3d"],
          fill: { type: "gradient", gradient: { shadeIntensity: 0.5, opacityFrom: 0.4, opacityTo: 0, stops: [0, 100] } },
          grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 4, padding: { left: 6, right: 10 } },
          dataLabels: { enabled: false },
          tooltip: { theme: "dark", x: { format: "dd/MM/yyyy" }, y: { formatter: (v) => moneyFull(v) } }
        });
        flowChart.render();
      }
    }
    const pEl = qs("#h-proj");
    if (pEl) {
      const counts = STATUS_ORDER.map((st) => projetos.filter((p) => p.status === st).length);
      const cats = STATUS_ORDER.map((st) => STATUS_LABEL[st]);
      const cores = STATUS_ORDER.map((st) => STATUS_COR[st]);
      const opts = {
        chart: { type: "bar", height: 200, toolbar: { show: false }, fontFamily: "Inter, sans-serif" },
        series: [{ name: "Obras", data: counts }],
        colors: cores,
        plotOptions: { bar: { columnWidth: "46%", borderRadius: 8, borderRadiusApplication: "end", distributed: true } },
        fill: { type: "gradient", gradient: { shade: "light", type: "vertical", shadeIntensity: 0.18, opacityFrom: 1, opacityTo: 0.82, stops: [0, 100] } },
        dataLabels: { enabled: true, style: { colors: ["#fff"], fontWeight: 700 } },
        legend: { show: false },
        xaxis: { categories: cats, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
        yaxis: { labels: { style: AXIS }, tickAmount: 3 },
        grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 4 },
        tooltip: { theme: "dark" }
      };
      if (projChart) projChart.updateOptions(opts);
      else {
        projChart = new A(pEl, opts);
        projChart.render();
      }
    }
    const bEl = qs("#h-bars");
    if (bEl) {
      const d = porDia();
      const series = [{ name: "Entradas", data: d.ent }, { name: "Sa\xEDdas", data: d.sai }];
      if (barsChart) barsChart.updateOptions({ series, xaxis: { categories: d.dias } });
      else {
        barsChart = new A(bEl, {
          chart: { type: "bar", height: 200, toolbar: { show: false }, fontFamily: "Inter, sans-serif" },
          series,
          colors: ["#34d399", "#f87171"],
          plotOptions: { bar: { columnWidth: "62%", borderRadius: 7, borderRadiusApplication: "end" } },
          fill: { type: "gradient", gradient: { shade: "light", type: "vertical", shadeIntensity: 0.18, opacityFrom: 1, opacityTo: 0.82, stops: [0, 100] } },
          dataLabels: { enabled: false },
          xaxis: { categories: d.dias, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
          yaxis: { labels: { formatter: (v) => moneyK(v), style: AXIS } },
          grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 4 },
          legend: { show: true, position: "top", horizontalAlign: "right", fontSize: "12px", labels: { colors: "#98a1b3" }, markers: { radius: 4 } },
          tooltip: { theme: "dark", y: { formatter: (v) => moneyFull(v) } }
        });
        barsChart.render();
      }
    }
  }
  function updateLive() {
    const el = qs("#h-updated");
    if (el) el.textContent = online ? "atualizado " + (/* @__PURE__ */ new Date()).toLocaleTimeString("pt-BR") : "";
  }
  var eventos = [];
  var FEED_IC = {
    movimentacoes: { ic: "swap-horizontal-outline", cls: "blue" },
    agendamentos: { ic: "calendar-number-outline", cls: "" },
    dias: { ic: "briefcase-outline", cls: "amber" },
    documentos: { ic: "document-text-outline", cls: "viol" },
    projetos: { ic: "flash-outline", cls: "pos" },
    fiscal: { ic: "library-outline", cls: "amber" },
    colaboradores: { ic: "people-outline", cls: "blue" },
    evolucao: { ic: "trending-up-outline", cls: "pos" }
  };
  function feedIcon(recurso, acao) {
    if (acao === "remover" || acao === "excluir") return { ic: "trash-outline", cls: "neg" };
    return FEED_IC[recurso] || { ic: "pulse-outline", cls: "" };
  }
  function tempoRel(ts) {
    const t = new Date(ts).getTime();
    if (!isFinite(t)) return "";
    const s = Math.max(0, Math.floor((Date.now() - t) / 1e3));
    if (s < 10) return "agora";
    if (s < 60) return `h\xE1 ${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `h\xE1 ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `h\xE1 ${h} h`;
    const d = Math.floor(h / 24);
    return d === 1 ? "ontem" : `h\xE1 ${d} d`;
  }
  function linhaFeed(e) {
    const { ic, cls } = feedIcon(e.recurso, e.acao);
    const ator = e.ator ? `<span class="fe-ator">${esc(e.ator)}</span><span class="fe-dot">\xB7</span>` : "";
    const meta = [];
    if (e.detalhe) meta.push(esc(e.detalhe));
    meta.push(tempoRel(e.ts));
    return `<div class="feed-row" data-id="${e.id}"><span class="feed-ic ${cls}"><iconify-icon icon="ion:${ic}"></iconify-icon></span><div class="feed-body"><b>${esc(e.titulo)}</b><small>${ator}${meta.join(" \xB7 ")}</small></div></div>`;
  }
  function renderFeed() {
    const el = qs("#h-feed");
    if (!el) return;
    if (!eventos.length) {
      el.innerHTML = `<div class="dp-sub feed-empty">Sem atividade recente.</div>`;
      return;
    }
    el.innerHTML = eventos.slice(0, 30).map(linhaFeed).join("");
  }
  async function carregarFeed() {
    try {
      const r = await fetch(`${API_BASE}/api/eventos?limite=30`);
      if (!r.ok) throw new Error();
      const j = await r.json();
      eventos = Array.isArray(j.eventos) ? j.eventos : [];
      renderFeed();
    } catch {
    }
  }
  function adicionarAoFeed(e) {
    if (!e || typeof e.id !== "number" || eventos.some((x) => x.id === e.id)) return;
    eventos.unshift(e);
    if (eventos.length > 40) eventos.length = 40;
    renderFeed();
    const novo = qs(`#h-feed .feed-row[data-id="${e.id}"]`);
    if (novo) {
      novo.classList.add("novo");
      window.setTimeout(() => novo.classList.remove("novo"), 700);
    }
  }
  async function getJSON(path, fallback) {
    try {
      const r = await fetch(`${API_BASE}${path}`);
      if (!r.ok) throw new Error();
      return await r.json();
    } catch {
      throw new Error("offline");
    }
  }
  async function carregar() {
    try {
      const [rz, ml, pj, ag, dv, fs] = await Promise.all([
        getJSON("/api/movimentacoes/resumo", {}),
        getJSON("/api/movimentacoes", []),
        getJSON("/api/projetos", []),
        getJSON("/api/agendamentos", []),
        getJSON("/api/documentos/a-vencer?dias=30", []),
        getJSON("/api/fiscal", { obrigacoes: [] })
      ]);
      resumo = rz;
      movs = ml;
      projetos = pj;
      ags = ag;
      docsVenc = dv;
      obrig = fs.obrigacoes ?? [];
      online = true;
    } catch {
      online = false;
    }
    setStatus();
    renderHero();
    renderKpis();
    renderProximos();
    renderAlertas();
    renderCharts();
    updateLive();
  }
  function situLabel(s) {
    return s === "confirmado" ? "Confirmado" : s === "pendente" ? "Pendente" : s === "concluido" ? "Conclu\xEDdo" : s === "cancelado" ? "Cancelado" : s;
  }
  function situClasse(s) {
    return s === "confirmado" || s === "concluido" ? "ok" : s === "pendente" ? "wait" : "bad";
  }
  function somaHora(hhmm, min) {
    const parts = hhmm.split(":");
    const h = Number(parts[0] || 0), m = Number(parts[1] || 0);
    const t = h * 60 + m + min;
    const H = Math.floor(t / 60) % 24, M = t % 60;
    return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
  }
  function ion(name) {
    return `<iconify-icon icon="ion:${name}"></iconify-icon>`;
  }
  function garantirModalAg() {
    if (qs("#m-agdet")) return;
    const w = document.createElement("div");
    w.className = "modal-wrap";
    w.id = "m-agdet";
    w.innerHTML = `<div class="modal"><div class="modal-head"><h3>Detalhes do servi\xE7o</h3><button class="mclose" data-close aria-label="Fechar">${ion("close-outline")}</button></div><div class="modal-body"><div class="agd-top"><span class="agd-ic">${ion("calendar-number-outline")}</span><div class="agd-ht"><b id="agd-titulo">\u2014</b><span class="pill" id="agd-sit">\u2014</span></div></div><div class="agd-list"><div class="agd-item"><span class="agd-k">${ion("people-outline")} Cliente</span><span class="agd-v" id="agd-cliente">\u2014</span></div><div class="agd-item"><span class="agd-k">${ion("person-outline")} T\xE9cnico</span><span class="agd-v" id="agd-tecnico">\u2014</span></div><div class="agd-item"><span class="agd-k">${ion("calendar-outline")} Data</span><span class="agd-v" id="agd-data">\u2014</span></div><div class="agd-item"><span class="agd-k">${ion("time-outline")} Hor\xE1rio</span><span class="agd-v" id="agd-hora">\u2014</span></div><div class="agd-item"><span class="agd-k">${ion("wallet-outline")} Valor</span><span class="agd-v" id="agd-valor">\u2014</span></div><div class="agd-item agd-obs-wrap" id="agd-obs-wrap"><span class="agd-k">${ion("document-text-outline")} Observa\xE7\xF5es</span><span class="agd-v" id="agd-obs">\u2014</span></div></div></div><div class="modal-foot"><button class="btn btn-primary" data-close>Fechar</button></div></div>`;
    document.body.appendChild(w);
  }
  function abrirDetalheAg(a) {
    garantirModalAg();
    const set = (id, v) => {
      const e = qs("#" + id);
      if (e) e.textContent = v;
    };
    set("agd-titulo", a.titulo || "Servi\xE7o");
    set("agd-cliente", a.cliente || "\u2014");
    set("agd-tecnico", a.tecnico || "\u2014");
    const p = a.data.split("-");
    set("agd-data", `${p[2]}/${p[1]}/${p[0]}`);
    const fim = a.duracaoMin ? somaHora(a.inicio, a.duracaoMin) : "";
    set("agd-hora", a.inicio + (fim ? ` \u2013 ${fim}` : "") + (a.duracaoMin ? ` \xB7 ${a.duracaoMin} min` : ""));
    set("agd-valor", a.valorCentavos > 0 ? brl(a.valorCentavos) : "\u2014");
    const sit = qs("#agd-sit");
    if (sit) {
      sit.textContent = situLabel(a.situacao);
      sit.className = "pill " + situClasse(a.situacao);
    }
    const ow = qs("#agd-obs-wrap");
    if (ow) {
      if (a.obs) {
        ow.style.display = "";
        set("agd-obs", a.obs);
      } else {
        ow.style.display = "none";
      }
    }
    document.body.classList.add("agdet-open");
  }
  function wire() {
    const b = document.body;
    const mb = qs(".menu-btn");
    if (mb) mb.addEventListener("click", () => b.classList.toggle("drawer-open"));
    const ov = qs(".drawer-overlay");
    if (ov) ov.addEventListener("click", () => b.classList.remove("drawer-open"));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") b.classList.remove("drawer-open");
    });
    const agl = qs("#h-ag");
    if (agl) {
      agl.addEventListener("click", (e) => {
        const row = e.target.closest(".ag-row");
        if (!row) return;
        const a = ags.find((x) => x.id === row.getAttribute("data-id"));
        if (a) abrirDetalheAg(a);
      });
      agl.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const row = e.target.closest(".ag-row");
        if (!row) return;
        e.preventDefault();
        const a = ags.find((x) => x.id === row.getAttribute("data-id"));
        if (a) abrirDetalheAg(a);
      });
    }
  }
  async function boot() {
    wire();
    mostrarSkeletons();
    await Promise.all([carregar(), carregarFeed()]);
    window.setInterval(() => {
      void carregar();
    }, 6e4);
    window.addEventListener("jc:mudou", () => {
      void carregar();
    });
    window.addEventListener("jc:evento", (e) => adicionarAoFeed(e.detail));
    window.setInterval(renderFeed, 6e4);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => {
    void boot();
  });
  else void boot();
})();

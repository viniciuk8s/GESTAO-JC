"use strict";
(() => {
  // src/web-comparativo.ts
  var API_BASE = window.JC_API || "http://localhost:3000";
  var serie = [];
  var atual = null;
  var comp = null;
  var online = false;
  var rangeN = 0;
  function qs(s) {
    return document.querySelector(s);
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
  function moneyK(v) {
    return Math.abs(v) >= 1e3 ? "R$ " + (v / 1e3).toFixed(0) + "k" : "R$ " + v;
  }
  function reais(c) {
    return Math.round(c / 100);
  }
  function pct1(n) {
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  }
  var MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var MES_LONGO = ["janeiro", "fevereiro", "mar\xE7o", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function mesCurto(m) {
    return `${MES_ABBR[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
  }
  function mesLongo(m) {
    return `${MES_LONGO[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
  }
  var I = {
    fat: '<iconify-icon icon="ion:trending-down-outline"></iconify-icon>',
    desp: '<iconify-icon icon="ion:trending-up-outline"></iconify-icon>',
    lucro: '<iconify-icon icon="ion:wallet-outline"></iconify-icon>',
    margem: '<iconify-icon icon="ion:pie-chart-outline"></iconify-icon>',
    off: '<iconify-icon icon="ion:cloud-offline-outline"></iconify-icon>'
  };
  function chip(d, bomSubir, modo = "pct") {
    if (!d) return "";
    if (d.direcao === "igual") return `<span class="delta-chip flat">sem varia\xE7\xE3o</span>`;
    const bom = d.direcao === "sobe" === bomSubir;
    const seta = d.direcao === "sobe" ? "\u25B2" : "\u25BC";
    let txt;
    if (modo === "pp") txt = `${seta} ${Math.abs(d.abs).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;
    else if (d.pct === null) txt = "novo";
    else txt = `${seta} ${Math.abs(d.pct).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    return `<span class="delta-chip ${bom ? "up" : "down"}">${txt}</span>`;
  }
  function apex() {
    return window.ApexCharts;
  }
  function vis(el) {
    return !!el && el.clientWidth > 4;
  }
  var fluxoChart = null;
  var lucroChart = null;
  var heroChart = null;
  var AXIS = { colors: "#6b7385", fontSize: "10px", fontWeight: 600 };
  function janela() {
    return rangeN > 0 ? serie.slice(-rangeN) : serie;
  }
  function renderHero() {
    const mesEl = qs("#cmp-hero-mes"), val = qs("#cmp-hero-val"), sub = qs("#cmp-hero-sub");
    if (!online || !atual) {
      if (mesEl) mesEl.textContent = "\u2014";
      if (val) val.textContent = "R$ \u2014";
      if (sub) sub.textContent = "conecte a API para ver os dados";
      return;
    }
    if (mesEl) mesEl.textContent = `Lucro \xB7 ${mesLongo(atual.mes)}`;
    if (val) {
      val.textContent = brl(atual.saldoCentavos);
      val.setAttribute("data-count", String(atual.saldoCentavos));
      val.setAttribute("data-fmt", "moeda");
      val.setAttribute("data-ck", "cmp-hero");
    }
    if (sub) sub.innerHTML = `faturamento <b style="color:var(--pos)">${brl(atual.entradasCentavos)}</b> \xB7 despesas <b style="color:var(--neg)">${brl(atual.saidasCentavos)}</b> \xB7 margem <b>${pct1(atual.margemPct)}</b>` + (comp && comp.mesAnterior ? ` &nbsp; ${chip(comp.saldo, true)} <small class="cmp-vs">vs. ${mesLongo(comp.mesAnterior)}</small>` : "");
  }
  function renderKpis() {
    const el = qs("#cmp-kpis");
    if (!el) return;
    if (!online || !atual) {
      el.innerHTML = "";
      return;
    }
    const c = comp;
    const card = (cor, ic, label, valorCentavos, ck, d, bomSubir) => `<div class="sumcard card"><span class="si ${cor}">${ic}</span><div class="sc-info"><small>${label}</small><b data-count="${valorCentavos}" data-fmt="moeda" data-ck="${ck}">${brl(valorCentavos)}</b></div>${chip(d, bomSubir)}</div>`;
    el.innerHTML = card("green", I.fat, "Faturamento", atual.entradasCentavos, "cmp-fat", c?.entradas, true) + card("red", I.desp, "Despesas", atual.saidasCentavos, "cmp-desp", c?.saidas, false) + card("acc", I.lucro, "Lucro", atual.saldoCentavos, "cmp-lucro", c?.saldo, true) + `<div class="sumcard card"><span class="si blue">${I.margem}</span><div class="sc-info"><small>Margem l\xEDquida</small><b>${pct1(atual.margemPct)}</b></div>${chip(c?.margem, true, "pp")}</div>`;
  }
  function renderCharts() {
    const A = apex();
    if (!A || !online) return;
    const dados = janela();
    const cats = dados.map((m) => mesCurto(m.mes));
    const fEl = qs("#cmp-chart-fluxo");
    const fSeries = [{ name: "Faturamento", data: dados.map((m) => reais(m.entradasCentavos)) }, { name: "Despesas", data: dados.map((m) => reais(m.saidasCentavos)) }];
    if (fluxoChart) fluxoChart.updateOptions({ series: fSeries, xaxis: { categories: cats } });
    else if (vis(fEl)) {
      fluxoChart = new A(fEl, {
        chart: { type: "bar", height: 240, toolbar: { show: false }, fontFamily: "Inter, sans-serif" },
        series: fSeries,
        colors: ["#34d399", "#f87171"],
        plotOptions: { bar: { columnWidth: "62%", borderRadius: 7, borderRadiusApplication: "end" } },
        fill: { type: "gradient", gradient: { shade: "light", type: "vertical", shadeIntensity: 0.18, opacityFrom: 1, opacityTo: 0.82, stops: [0, 100] } },
        dataLabels: { enabled: false },
        xaxis: { categories: cats, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
        yaxis: { labels: { formatter: (v) => moneyK(v), style: AXIS } },
        grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 4 },
        legend: { show: true, position: "top", horizontalAlign: "right", fontSize: "12px", labels: { colors: "#98a1b3" }, markers: { radius: 4 } },
        tooltip: { theme: "dark", y: { formatter: (v) => "R$ " + Number(v).toLocaleString("pt-BR") } }
      });
      fluxoChart.render();
    }
    const lEl = qs("#cmp-chart-lucro");
    const lSeries = [{ name: "Lucro", data: dados.map((m) => reais(m.saldoCentavos)) }];
    if (lucroChart) lucroChart.updateOptions({ series: lSeries, xaxis: { categories: cats } });
    else if (vis(lEl)) {
      lucroChart = new A(lEl, {
        chart: { type: "area", height: 240, toolbar: { show: false }, fontFamily: "Inter, sans-serif", dropShadow: { enabled: true, top: 5, blur: 6, opacity: 0.22, color: "#ff8a3d" } },
        series: lSeries,
        colors: ["#ff8a3d"],
        stroke: { curve: "smooth", width: 3 },
        fill: { type: "gradient", gradient: { shadeIntensity: 0.5, opacityFrom: 0.4, opacityTo: 0, stops: [0, 100] } },
        dataLabels: { enabled: false },
        xaxis: { categories: cats, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
        yaxis: { labels: { formatter: (v) => moneyK(v), style: AXIS }, tickAmount: 3 },
        grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 4 },
        tooltip: { theme: "dark", y: { formatter: (v) => "R$ " + Number(v).toLocaleString("pt-BR") } }
      });
      lucroChart.render();
    }
    const hEl = qs("#cmp-hero-chart");
    const hSeries = [{ name: "Lucro", data: serie.map((m) => reais(m.saldoCentavos)) }];
    if (heroChart) heroChart.updateOptions({ series: hSeries });
    else if (vis(hEl)) {
      heroChart = new A(hEl, {
        chart: { type: "area", height: 120, sparkline: { enabled: true }, fontFamily: "Inter, sans-serif" },
        series: hSeries,
        colors: ["#ff8a3d"],
        stroke: { curve: "smooth", width: 2 },
        fill: { type: "gradient", gradient: { shadeIntensity: 0.5, opacityFrom: 0.4, opacityTo: 0 } },
        tooltip: { theme: "dark", x: { show: false }, y: { formatter: (v) => "R$ " + Number(v).toLocaleString("pt-BR") } }
      });
      heroChart.render();
    }
  }
  function renderTabela() {
    const t = qs("#cmp-tabela");
    if (!t) return;
    const meta = qs("#cmp-tab-meta");
    if (!online) {
      t.innerHTML = `<tbody><tr><td class="cmp-empty">${I.off} Conecte a API para ver o comparativo.</td></tr></tbody>`;
      if (meta) meta.textContent = "";
      return;
    }
    const deltaSaldo = /* @__PURE__ */ new Map();
    for (let i = 0; i < serie.length; i++) {
      if (i === 0) {
        deltaSaldo.set(serie[i].mes, null);
        continue;
      }
      const ant = serie[i - 1].saldoCentavos;
      deltaSaldo.set(serie[i].mes, ant === 0 ? null : (serie[i].saldoCentavos - ant) / Math.abs(ant) * 100);
    }
    const dados = [...janela()].reverse();
    if (meta) meta.textContent = `${dados.length} ${dados.length === 1 ? "m\xEAs" : "meses"}`;
    const linhas = dados.map((m) => {
      const dp = deltaSaldo.get(m.mes);
      const dChip = dp === void 0 ? "" : dp === null ? '<span class="delta-chip flat">\u2014</span>' : `<span class="delta-chip ${dp >= 0 ? "up" : "down"}">${dp >= 0 ? "\u25B2" : "\u25BC"} ${Math.abs(dp).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>`;
      return `<tr><td class="cmp-mes">${mesLongo(m.mes)}</td><td class="pos">${brl(m.entradasCentavos)}</td><td class="neg">${brl(m.saidasCentavos)}</td><td><b>${brl(m.saldoCentavos)}</b></td><td>${pct1(m.margemPct)}</td><td>${dChip}</td></tr>`;
    }).join("");
    t.innerHTML = `<thead><tr><th>M\xEAs</th><th>Faturamento</th><th>Despesas</th><th>Lucro</th><th>Margem</th><th>\u0394 Lucro</th></tr></thead><tbody>${linhas}</tbody>`;
  }
  function renderRange() {
    document.querySelectorAll("#cmp-range .chipf").forEach((c) => c.classList.toggle("on", Number(c.getAttribute("data-range")) === rangeN));
  }
  function renderTudo() {
    renderHero();
    renderKpis();
    renderCharts();
    renderTabela();
    renderRange();
  }
  async function carregar() {
    try {
      const r = await fetch(`${API_BASE}/api/analytics/mensal`);
      if (!r.ok) throw new Error();
      const p = await r.json();
      serie = Array.isArray(p.serie) ? p.serie : [];
      atual = p.atual;
      comp = p.comparativo;
      online = true;
    } catch {
      online = false;
    }
    renderTudo();
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
    qs("#cmp-range")?.addEventListener("click", (e) => {
      const chipEl = e.target.closest(".chipf");
      if (!chipEl) return;
      rangeN = Number(chipEl.getAttribute("data-range")) || 0;
      renderTudo();
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

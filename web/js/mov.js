"use strict";
(() => {
  // src/web-mov.ts
  var API_BASE = typeof window !== "undefined" && window.JC_API || "http://localhost:3000";
  var I = {
    arrowIn: '<iconify-icon icon="ion:trending-down-outline"></iconify-icon>',
    arrowOut: '<iconify-icon icon="ion:trending-up-outline"></iconify-icon>',
    wallet: '<iconify-icon icon="ion:wallet-outline"></iconify-icon>',
    trendUp: '<iconify-icon icon="ion:trending-up-outline"></iconify-icon>',
    chart: '<iconify-icon icon="ion:bar-chart-outline"></iconify-icon>',
    clock: '<iconify-icon icon="ion:time-outline"></iconify-icon>',
    sun: '<iconify-icon icon="ion:sunny-outline"></iconify-icon>',
    zap: '<iconify-icon icon="ion:flash-outline"></iconify-icon>',
    pkg: '<iconify-icon icon="ion:cube-outline"></iconify-icon>',
    users: '<iconify-icon icon="ion:people-outline"></iconify-icon>',
    building: '<iconify-icon icon="ion:business-outline"></iconify-icon>',
    landmark: '<iconify-icon icon="ion:library-outline"></iconify-icon>',
    chevr: '<iconify-icon icon="ion:chevron-forward-outline"></iconify-icon>',
    check: '<iconify-icon icon="ion:checkmark-outline"></iconify-icon>',
    off: '<iconify-icon icon="ion:cloud-offline-outline"></iconify-icon>',
    edit: '<iconify-icon icon="ion:create-outline"></iconify-icon>',
    trash: '<iconify-icon icon="ion:trash-outline"></iconify-icon>'
  };
  var movs = [];
  var resumo = null;
  var filtroTipo = "";
  var online = false;
  var editId = null;
  var flowChart = null;
  var gaugeChart = null;
  var donutChart = null;
  var barsChart = null;
  var REFRESH_MS = 6e4;
  var CAT_CORES = ["#ef6300", "#5b8def", "#a78bfa", "#fbbf24", "#34d399", "#38bdf8", "#fb7185", "#64748b"];
  function apex() {
    return window.ApexCharts;
  }
  function reais(c) {
    return Math.round(c / 100);
  }
  function fmtDia(iso) {
    const p = iso.split("-");
    return `${p[2]}/${p[1]}`;
  }
  function serieFluxo() {
    const asc = [...movs].sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : numId(a.id) - numId(b.id));
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
    const chaves = [...map.keys()].sort();
    return {
      dias: chaves.map(fmtDia),
      ent: chaves.map((k) => reais(map.get(k).ent)),
      sai: chaves.map((k) => reais(map.get(k).sai))
    };
  }
  var AXIS = { colors: "#6b7385", fontSize: "10px", fontWeight: 600 };
  function moneyK(v) {
    return Math.abs(v) >= 1e3 ? "R$ " + (v / 1e3).toFixed(0) + "k" : "R$ " + v;
  }
  function moneyK1(v) {
    return Math.abs(v) >= 1e3 ? "R$ " + (v / 1e3).toFixed(1).replace(".", ",") + "k" : "R$ " + v;
  }
  function moneyFull(v) {
    return "R$ " + Number(v).toLocaleString("pt-BR");
  }
  function qs(s) {
    return document.querySelector(s);
  }
  function esc(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }
  function brl(centavos) {
    const neg = centavos < 0;
    const total = Math.abs(Math.trunc(centavos));
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
  function hojeISO() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(/* @__PURE__ */ new Date());
  }
  function numId(id) {
    const n = Number.parseInt(id.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }
  var MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  function fmtData(iso) {
    const p = iso.split("-");
    return `${p[2]}/${p[1]}/${p[0]}`;
  }
  function dayLabel(iso) {
    const p = iso.split("-");
    const rot = `${Number(p[2])} ${MESES[Number(p[1]) - 1]}`;
    return (iso === hojeISO() ? "Hoje \xB7 " : "") + rot;
  }
  var FORMA_LABEL = { pix: "Pix", dinheiro: "Dinheiro", cartao: "Cart\xE3o", boleto: "Boleto", transferencia: "Transfer\xEAncia" };
  var SIT_LABEL = { pago: "Pago", pendente: "Pendente", agendado: "Agendado" };
  function catIcon(cat) {
    const c = cat.toLowerCase();
    if (c.includes("solar") || c.includes("fotov")) return I.sun;
    if (c.includes("forneced")) return I.pkg;
    if (c.includes("folha") || c.includes("sal\xE1r") || c.includes("equipe")) return I.users;
    if (c.includes("imposto") || c.includes("das") || c.includes("iss")) return I.landmark;
    if (c.includes("serv") || c.includes("manuten") || c.includes("vistor")) return I.zap;
    if (c.includes("instala") || c.includes("aluguel") || c.includes("galp")) return I.building;
    return I.wallet;
  }
  function saldosPorId() {
    const asc = [...movs].sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : numId(a.id) - numId(b.id));
    let s = 0;
    const map = {};
    for (const m of asc) {
      s += m.tipo === "entrada" ? m.valorCentavos : -m.valorCentavos;
      map[m.id] = s;
    }
    return map;
  }
  function exrow(m, saldo) {
    const sign = m.tipo === "entrada" ? "+ " : "\u2212 ";
    return `<div class="exrow" data-id="${m.id}" data-search="${esc(`${m.descricao} ${m.categoria}`.toLowerCase())}" data-sort-data="${m.data.replace(/-/g, "")}" data-sort-valor="${m.valorCentavos}">
    <span class="excat ${m.tipo === "entrada" ? "in" : "out"} st-${m.situacao}">${catIcon(m.categoria)}</span>
    <div class="exmain">
      <div class="ex-top"><b class="ex-desc">${esc(m.descricao)}</b><b class="ex-amt ${m.tipo === "entrada" ? "pos" : "neg"}">${sign}${brl(m.valorCentavos)}</b></div>
      <div class="ex-bot"><small class="ex-meta">${esc(m.categoria)} \xB7 ${FORMA_LABEL[m.forma]}</small><small class="ex-saldo">saldo ${brl(saldo)}</small></div>
    </div><span class="exchev">${I.chevr}</span></div>`;
  }
  function renderList() {
    const el = qs("#mov-list");
    if (!el) return;
    if (!online) {
      el.innerHTML = `<div class="colab-offline">${I.off}<div><b>API local n\xE3o encontrada</b><p>Inicie a API para ver e lan\xE7ar movimenta\xE7\xF5es:</p><code>cd logica-ts &amp;&amp; npm install &amp;&amp; npm run api</code><p class="dim">Sem a API, esta se\xE7\xE3o fica vazia; as demais telas seguem funcionando.</p></div></div>`;
      return;
    }
    const saldo = saldosPorId();
    const lista = filtroTipo ? movs.filter((m) => m.tipo === filtroTipo) : movs;
    if (lista.length === 0) {
      el.innerHTML = `<div class="day-empty">${I.wallet}<p>Nenhum lan\xE7amento ${filtroTipo ? "deste tipo" : "ainda"}.<br>Use <b>Novo lan\xE7amento</b> para come\xE7ar.</p></div>`;
      return;
    }
    let html = "";
    let dia = "";
    for (const m of lista) {
      if (m.data !== dia) {
        html += `<div class="exday">${dayLabel(m.data)}</div>`;
        dia = m.data;
      }
      html += exrow(m, saldo[m.id] ?? 0);
    }
    el.innerHTML = html;
  }
  function renderResumo() {
    const sum = qs("#mov-sum");
    const kpis = qs("#mov-kpis");
    const cats = qs("#mov-cats");
    if (!resumo || !online) {
      if (sum) sum.innerHTML = "";
      if (kpis) kpis.innerHTML = "";
      if (cats) cats.innerHTML = "";
      return;
    }
    const r = resumo;
    if (sum) sum.innerHTML = `<div class="sumcard card" data-tip="Total de entradas no per\xEDodo filtrado"><span class="si green">${I.arrowIn}</span><div class="sc-info"><small>Entradas</small><b data-count="${r.entradasCentavos}" data-fmt="moeda" data-ck="mov-entradas">${brl(r.entradasCentavos)}</b></div></div><div class="sumcard card" data-tip="Total de sa\xEDdas no per\xEDodo filtrado"><span class="si red">${I.arrowOut}</span><div class="sc-info"><small>Sa\xEDdas</small><b data-count="${r.saidasCentavos}" data-fmt="moeda" data-ck="mov-saidas">${brl(r.saidasCentavos)}</b></div></div><div class="sumcard card" data-tip="Entradas menos sa\xEDdas"><span class="si acc">${I.wallet}</span><div class="sc-info"><small>Saldo do per\xEDodo</small><b data-count="${r.saldoCentavos}" data-fmt="moeda" data-ck="mov-saldo">${brl(r.saldoCentavos)}</b></div></div><div class="sumcard card" data-tip="Quanto sobra de cada real que entra (saldo \xF7 entradas)"><span class="si acc"><iconify-icon icon="ion:pie-chart-outline"></iconify-icon></span><div class="sc-info"><small>Margem</small><b data-count="${r.entradasCentavos > 0 ? Math.round(r.saldoCentavos / r.entradasCentavos * 100) : 0}" data-fmt="pct" data-ck="mov-margem">${r.entradasCentavos > 0 ? Math.round(r.saldoCentavos / r.entradasCentavos * 100) : 0}%</b></div></div>`;
    if (kpis) {
      const nEnt = movs.filter((m) => m.tipo === "entrada").length;
      const ticket = nEnt > 0 ? Math.round(r.entradasCentavos / nEnt) : 0;
      const margem = r.entradasCentavos > 0 ? r.saldoCentavos / r.entradasCentavos * 100 : 0;
      const nReceber = movs.filter((m) => m.tipo === "entrada" && m.situacao !== "pago").length;
      kpis.innerHTML = `<div class="dk card"><div class="dk-top"><span class="dk-ic green">${I.trendUp}</span>Saldo (lucro)</div><div class="dk-v">${brl(r.saldoCentavos)}</div><div class="dk-s">entradas \u2212 sa\xEDdas</div></div><div class="dk card"><div class="dk-top"><span class="dk-ic blue">${I.chart}</span>Margem</div><div class="dk-v">${margem.toFixed(1).replace(".", ",")}%</div><div class="dk-s">sobre as entradas</div></div><div class="dk card"><div class="dk-top"><span class="dk-ic orange">${I.wallet}</span>Ticket m\xE9dio</div><div class="dk-v">${brl(ticket)}</div><div class="dk-s">por entrada</div></div><div class="dk card"><div class="dk-top"><span class="dk-ic amber">${I.clock}</span>A receber</div><div class="dk-v">${brl(r.aReceberCentavos)}</div><div class="dk-s">${nReceber} em aberto</div></div>`;
    }
    if (cats) {
      if (r.porCategoria.length === 0) {
        cats.innerHTML = `<div class="dp-sub">Sem sa\xEDdas no per\xEDodo.</div>`;
        return;
      }
      const max = Math.max(...r.porCategoria.map((c) => c.saidaCentavos), 1);
      const cores = ["o", "b", "v", "a", "n"];
      cats.innerHTML = '<div class="rbars">' + r.porCategoria.map(
        (c, i) => `<div class="rbar"><span class="rb-l">${esc(c.categoria)}</span><div class="rb-track"><div class="rb-fill ${cores[i % cores.length]}" style="width:${Math.round(c.saidaCentavos / max * 100)}%"></div></div><span class="rb-v">${brl(c.saidaCentavos)}</span></div>`
      ).join("") + "</div>";
    }
  }
  function setStatus() {
    const el = qs("#api-status");
    if (!el) return;
    el.className = "api-pill " + (online ? "on" : "off");
    el.innerHTML = online ? `<i></i> API conectada` : `${I.off} API offline`;
  }
  function renderHero() {
    const v = qs("#mov-hero-val");
    const s = qs("#mov-hero-sub");
    if (!resumo || !online) {
      if (v) v.textContent = "R$ \u2014";
      if (s) s.textContent = "conecte a API para ver os dados";
      return;
    }
    if (v) v.textContent = brl(resumo.saldoCentavos);
    if (s) s.innerHTML = `entradas <b style="color:var(--pos)">${brl(resumo.entradasCentavos)}</b> \xB7 sa\xEDdas <b style="color:var(--neg)">${brl(resumo.saidasCentavos)}</b>`;
  }
  function updateLive() {
    const el = qs("#mov-updated");
    if (!el) return;
    el.textContent = online ? "\xB7 atualizado " + (/* @__PURE__ */ new Date()).toLocaleTimeString("pt-BR") : "";
  }
  function renderCharts() {
    const A = apex();
    if (!A || !resumo || !online) return;
    const flowEl = qs("#mov-flow");
    if (flowEl) {
      const data = serieFluxo();
      if (flowChart) flowChart.updateSeries([{ name: "Saldo acumulado", data }]);
      else {
        flowChart = new A(flowEl, {
          chart: { type: "area", height: 160, toolbar: { show: false }, animations: { enabled: true, easing: "easeinout", speed: 700 }, parentHeightOffset: 0, fontFamily: "Inter, sans-serif", dropShadow: { enabled: true, top: 5, left: 0, blur: 6, opacity: 0.22, color: "#ff8a3d" } },
          series: [{ name: "Saldo acumulado", data }],
          xaxis: { type: "datetime", axisBorder: { show: false }, axisTicks: { show: false }, labels: { datetimeFormatter: { day: "dd/MM" }, style: AXIS } },
          yaxis: { labels: { formatter: (v) => moneyK(v), style: AXIS }, tickAmount: 3 },
          stroke: { curve: "smooth", width: 3 },
          colors: ["#ff8a3d"],
          fill: { type: "gradient", gradient: { shadeIntensity: 0.5, opacityFrom: 0.4, opacityTo: 0, stops: [0, 100] } },
          markers: { size: 0, strokeColors: "#ff8a3d", hover: { size: 5 } },
          grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 4, padding: { left: 6, right: 10, top: 0, bottom: 0 } },
          dataLabels: { enabled: false },
          tooltip: { theme: "dark", x: { format: "dd/MM/yyyy" }, y: { formatter: (v) => moneyFull(v) } }
        });
        flowChart.render();
      }
    }
    const barsEl = qs("#mov-bars");
    if (barsEl) {
      const d = porDia();
      const series = [{ name: "Entradas", data: d.ent }, { name: "Sa\xEDdas", data: d.sai }];
      if (barsChart) barsChart.updateOptions({ series, xaxis: { categories: d.dias } });
      else {
        barsChart = new A(barsEl, {
          chart: { type: "bar", height: 230, stacked: false, toolbar: { show: false }, fontFamily: "Inter, sans-serif" },
          series,
          colors: ["#34d399", "#f87171"],
          plotOptions: { bar: { columnWidth: "62%", borderRadius: 7, borderRadiusApplication: "end" } },
          fill: { type: "gradient", gradient: { shade: "light", type: "vertical", shadeIntensity: 0.18, opacityFrom: 1, opacityTo: 0.82, stops: [0, 100] } },
          dataLabels: { enabled: false },
          stroke: { show: false },
          xaxis: { categories: d.dias, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
          yaxis: { labels: { formatter: (v) => moneyK(v), style: AXIS } },
          grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 4 },
          legend: { show: true, position: "top", horizontalAlign: "right", fontSize: "12px", labels: { colors: "#98a1b3" }, markers: { radius: 4 } },
          tooltip: { theme: "dark", y: { formatter: (v) => moneyFull(v) } }
        });
        barsChart.render();
      }
    }
    const gEl = qs("#mov-gauge");
    if (gEl) {
      const margem = resumo.entradasCentavos > 0 ? resumo.saldoCentavos / resumo.entradasCentavos * 100 : 0;
      const val = Math.max(0, Math.min(100, Math.round(margem)));
      if (gaugeChart) gaugeChart.updateSeries([val]);
      else {
        gaugeChart = new A(gEl, {
          chart: { type: "radialBar", height: 210, fontFamily: "Inter, sans-serif" },
          series: [val],
          labels: ["do faturamento"],
          colors: ["#34d399"],
          plotOptions: { radialBar: {
            hollow: { size: "56%" },
            track: { background: "rgba(255,255,255,.06)" },
            dataLabels: {
              name: { show: true, color: "#98a1b3", fontSize: "11px", offsetY: 24 },
              value: { show: true, color: "#fff", fontSize: "30px", fontFamily: "Sora, sans-serif", fontWeight: 800, offsetY: -8, formatter: (v) => v + "%" }
            }
          } },
          stroke: { lineCap: "round" }
        });
        gaugeChart.render();
      }
    }
    const gSub = qs("#mov-gauge-sub");
    if (gSub) gSub.innerHTML = `<div><small>Lucro</small><b style="color:var(--pos)">${brl(resumo.saldoCentavos)}</b></div><div><small>Faturamento</small><b>${brl(resumo.entradasCentavos)}</b></div>`;
    const dEl = qs("#mov-donut");
    const cats = resumo.porCategoria;
    const total = cats.reduce((s, c) => s + c.saidaCentavos, 0);
    if (dEl) {
      const data = cats.map((c) => ({ x: c.categoria, y: reais(c.saidaCentavos) }));
      const opts = {
        chart: { type: "treemap", height: 230, toolbar: { show: false }, animations: { enabled: true }, fontFamily: "Inter, sans-serif" },
        series: [{ data }],
        colors: CAT_CORES,
        plotOptions: { treemap: { distributed: true, enableShades: false } },
        dataLabels: {
          enabled: true,
          offsetY: -3,
          style: { fontSize: "12px", fontWeight: 700, fontFamily: "Inter, sans-serif", colors: ["#fff"] },
          formatter: (text, op) => [text, moneyK1(op.value)]
        },
        legend: { show: false },
        stroke: { width: 2, colors: ["#0c0e13"] },
        tooltip: { theme: "dark", y: { formatter: (v) => moneyFull(v) } }
      };
      if (donutChart) donutChart.updateOptions(opts);
      else {
        donutChart = new A(dEl, opts);
        donutChart.render();
      }
    }
    const leg = qs("#mov-donut-leg");
    if (leg) {
      const t = total || 1;
      leg.innerHTML = cats.map(
        (c, i) => `<div class="leg-row"><span class="leg-dot" style="background:${CAT_CORES[i % CAT_CORES.length]}"></span><span class="leg-name">${esc(c.categoria)}</span><span class="leg-val">${brl(c.saidaCentavos)}</span><span class="leg-pct">${Math.round(c.saidaCentavos / t * 100)}%</span></div>`
      ).join("");
    }
  }
  async function carregar() {
    try {
      const [rl, rr] = await Promise.all([fetch(`${API_BASE}/api/movimentacoes`), fetch(`${API_BASE}/api/movimentacoes/resumo`)]);
      if (!rl.ok || !rr.ok) throw new Error("api");
      movs = await rl.json();
      resumo = await rr.json();
      online = true;
    } catch {
      online = false;
    }
    setStatus();
    renderResumo();
    renderList();
    renderHero();
    renderCharts();
    updateLive();
  }
  function abrirDetalhe(id) {
    const m = movs.find((x) => x.id === id);
    if (!m) return;
    const rows = [
      ["Descri\xE7\xE3o", esc(m.descricao)],
      ["Valor", `<b class="${m.tipo === "entrada" ? "pos" : "neg"}">${m.tipo === "entrada" ? "+ " : "\u2212 "}${brl(m.valorCentavos)}</b>`],
      ["Tipo", m.tipo === "entrada" ? "Entrada" : "Sa\xEDda"],
      ["Categoria", esc(m.categoria)],
      ["Forma", FORMA_LABEL[m.forma]],
      ["Data", fmtData(m.data)],
      ["Situa\xE7\xE3o", `<b class="stt ${m.situacao}">${SIT_LABEL[m.situacao]}</b>`]
    ];
    const body = qs("#det-rows");
    if (body) body.innerHTML = rows.map(([k, v]) => `<div class="mrow"><span>${k}</span><b>${v}</b></div>`).join("");
    const del = qs("#det-del");
    if (del) del.setAttribute("data-id", m.id);
    const ed = qs("#det-edit");
    if (ed) ed.setAttribute("data-id", m.id);
    openModal("detail");
  }
  function setForma(sel, v) {
    const e = qs(sel);
    if (e) e.value = v;
  }
  var CATS_PADRAO = ["Servi\xE7os", "Fornecedores", "Folha de pagamento", "Instala\xE7\xF5es", "Impostos", "Gasolina", "Almo\xE7o"];
  function toggleCatOutro() {
    const sel = qs("#mov-cat");
    const inp = qs("#mov-cat-outro");
    if (!sel || !inp) return;
    const outros = sel.value === "Outros";
    inp.hidden = !outros;
    if (outros) inp.focus();
  }
  function catValor() {
    const sel = qs("#mov-cat");
    if (sel && sel.value === "Outros") {
      const v = (qs("#mov-cat-outro")?.value ?? "").trim();
      if (v) return v;
    }
    return sel?.value ?? "";
  }
  function abrirNovo(m) {
    editId = m ? m.id : null;
    const title = qs("#mnovo-title");
    if (title) title.textContent = m ? "Editar lan\xE7amento" : "Novo lan\xE7amento";
    const tipo = m ? m.tipo : "entrada";
    document.querySelectorAll("#m-novo .seg-btn").forEach((b) => b.classList.toggle("on", b.getAttribute("data-tipo") === tipo));
    const setV = (sel, val) => {
      const e = qs(sel);
      if (e) e.value = val;
    };
    setV("#mov-valor", m ? brl(m.valorCentavos).replace("R$ ", "") : "");
    setV("#mov-desc", m ? m.descricao : "");
    const inpOutro = qs("#mov-cat-outro");
    if (m && CATS_PADRAO.indexOf(m.categoria) < 0 && m.categoria) {
      setForma("#mov-cat", "Outros");
      if (inpOutro) {
        inpOutro.value = m.categoria;
        inpOutro.hidden = false;
      }
    } else {
      setForma("#mov-cat", m ? m.categoria : "Servi\xE7os");
      if (inpOutro) {
        inpOutro.value = "";
        inpOutro.hidden = true;
      }
    }
    setForma("#mov-forma", m ? m.forma : "pix");
    setV("#mov-data", m ? m.data : hojeISO());
    setForma("#mov-situacao", m ? m.situacao : "pago");
    const rec = qs("#mov-recorrente");
    if (rec) rec.classList.toggle("on", m ? m.recorrente : false);
    const erro = qs("#mov-erro");
    if (erro) erro.hidden = true;
    openModal("novo");
  }
  function valorCentavos(v) {
    const n = parseFloat(v.trim().replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  async function salvar() {
    const val = (sel) => qs(sel)?.value ?? "";
    const tipoBtn = qs("#m-novo .seg-btn.on");
    const rec = qs("#mov-recorrente");
    const corpo = {
      data: val("#mov-data"),
      descricao: val("#mov-desc"),
      categoria: catValor(),
      tipo: tipoBtn?.getAttribute("data-tipo") ?? "entrada",
      forma: val("#mov-forma"),
      valorCentavos: valorCentavos(val("#mov-valor")),
      situacao: val("#mov-situacao"),
      recorrente: rec ? rec.classList.contains("on") : false
    };
    const erro = qs("#mov-erro");
    try {
      const url = editId ? `${API_BASE}/api/movimentacoes/${editId}` : `${API_BASE}/api/movimentacoes`;
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
        erro.textContent = "API offline \u2014 inicie a API para lan\xE7ar movimenta\xE7\xF5es.";
        erro.hidden = false;
      }
      return;
    }
    closeAll();
    await carregar();
    toast(editId ? "Lan\xE7amento atualizado" : "Lan\xE7amento salvo com sucesso");
  }
  async function remover(id) {
    try {
      await fetch(`${API_BASE}/api/movimentacoes/${id}`, { method: "DELETE" });
    } catch {
    }
    closeAll();
    await carregar();
    toast("Lan\xE7amento removido");
  }
  var MODS = ["detail", "novo", "export"];
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
    const catSel = qs("#mov-cat");
    if (catSel) catSel.addEventListener("change", toggleCatOutro);
    document.querySelectorAll("[data-open]").forEach((el) => el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (el.getAttribute("data-open") === "novo") abrirNovo();
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
      if (c.hasAttribute("data-tipo")) {
        filtroTipo = c.getAttribute("data-tipo") ?? "";
        renderList();
      }
    }));
    document.querySelectorAll("#m-novo .seg-btn").forEach((s) => s.addEventListener("click", () => {
      document.querySelectorAll("#m-novo .seg-btn").forEach((x) => x.classList.remove("on"));
      s.classList.add("on");
    }));
    const rec = qs("#mov-recorrente");
    if (rec) rec.addEventListener("click", () => rec.classList.toggle("on"));
    const save = qs("#mov-save");
    if (save) save.addEventListener("click", () => {
      void salvar();
    });
    const list = qs("#mov-list");
    if (list) list.addEventListener("click", (e) => {
      const row = e.target.closest(".exrow");
      if (row) abrirDetalhe(row.getAttribute("data-id") ?? "");
    });
    const del = qs("#det-del");
    if (del) del.addEventListener("click", () => {
      void remover(del.getAttribute("data-id") ?? "");
    });
    const ed = qs("#det-edit");
    if (ed) ed.addEventListener("click", () => {
      const m = movs.find((x) => x.id === ed.getAttribute("data-id"));
      if (m) abrirNovo(m);
    });
  }
  async function boot() {
    wire();
    await carregar();
    window.setInterval(() => {
      void carregar();
    }, REFRESH_MS);
    window.addEventListener("jc:mudou", () => {
      void carregar();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => {
    void boot();
  });
  else void boot();
})();

"use strict";
(() => {
  // src/jornadas.ts
  function jornadaDeServico(s) {
    if (s.situacao !== "concluido") return null;
    if (s.tecnico.trim() === "") return null;
    return {
      id: `j_${s.id}`,
      origemId: s.id,
      funcionario: s.tecnico,
      data: s.data,
      servico: s.titulo,
      cliente: s.cliente,
      duracaoMin: s.duracaoMin,
      pago: false
      // dia recém-registrado começa como "a pagar"
    };
  }
  var DiasTrabalhadosStore = class {
    constructor(seed = []) {
      this.itens = [];
      this.seq = 0;
      for (const j of seed) {
        this.itens.push({ ...j });
        const n = Number.parseInt(j.origemId.replace(/\D/g, ""), 10);
        if (Number.isFinite(n) && n > this.seq) this.seq = n;
      }
    }
    /** Registra uma jornada. Idempotente por `origemId` (não duplica). */
    registrar(j) {
      if (this.itens.some((x) => x.origemId === j.origemId)) return false;
      this.itens.push({ ...j });
      return true;
    }
    /** Registra a partir de um serviço concluído com colaborador. */
    registrarDeServico(s) {
      const j = jornadaDeServico(s);
      if (!j) return null;
      return this.registrar(j) ? { ...j } : null;
    }
    /** Lançamento manual de um dia trabalhado (gera id/origemId próprios). */
    adicionarManual(dados) {
      this.seq += 1;
      const origemId = `man_${this.seq}`;
      const j = { id: `j_${origemId}`, origemId, ...dados };
      this.itens.push({ ...j });
      return { ...j };
    }
    /** Marca uma jornada como paga ou a pagar. */
    marcarPago(id, pago) {
      const j = this.itens.find((x) => x.id === id);
      if (!j) return false;
      j.pago = pago;
      return true;
    }
    buscar(id) {
      const j = this.itens.find((x) => x.id === id);
      return j ? { ...j } : void 0;
    }
    /** Remove a jornada gerada por um serviço (ex.: serviço/​data removidos). */
    removerPorOrigem(origemId) {
      const antes = this.itens.length;
      this.itens = this.itens.filter((x) => x.origemId !== origemId);
      return this.itens.length < antes;
    }
    /** Remove uma jornada pelo seu id (ex.: excluir um lançamento manual). */
    removerPorId(id) {
      const antes = this.itens.length;
      this.itens = this.itens.filter((x) => x.id !== id);
      return this.itens.length < antes;
    }
    todas() {
      return this.itens.map((j) => ({ ...j }));
    }
    /** Agrupa por funcionário, com totais; ordena por horas (desc). */
    porFuncionario() {
      const mapa = /* @__PURE__ */ new Map();
      for (const j of this.itens) {
        const arr = mapa.get(j.funcionario) ?? [];
        arr.push(j);
        mapa.set(j.funcionario, arr);
      }
      const res = [];
      for (const [funcionario, js] of mapa) {
        const dias = new Set(js.map((j) => j.data)).size;
        const minutos = js.reduce((a, j) => a + j.duracaoMin, 0);
        const pagos = js.filter((j) => j.pago).length;
        const jornadas = [...js].sort((a, b) => a.data < b.data ? 1 : a.data > b.data ? -1 : 0);
        res.push({ funcionario, dias, minutos, servicos: js.length, pagos, aPagar: js.length - pagos, jornadas });
      }
      res.sort((a, b) => b.minutos - a.minutos);
      return res;
    }
    /** Total de "pessoa-dias" (pares distintos funcionário+data). */
    totalDias() {
      return new Set(this.itens.map((j) => `${j.funcionario}|${j.data}`)).size;
    }
    totalMinutos() {
      return this.itens.reduce((a, j) => a + j.duracaoMin, 0);
    }
    totalFuncionarios() {
      return new Set(this.itens.map((j) => j.funcionario)).size;
    }
    totalPagos() {
      return this.itens.filter((j) => j.pago).length;
    }
    totalApagar() {
      return this.itens.filter((j) => !j.pago).length;
    }
  };

  // src/agendamentos.ts
  var MIN_POR_DIA = 24 * 60;
  function formatarDuracao(min) {
    if (min <= 0) return "0min";
    const h2 = Math.floor(min / 60);
    const m = min % 60;
    if (h2 === 0) return `${m}min`;
    if (m === 0) return `${h2}h`;
    return `${h2}h${String(m).padStart(2, "0")}`;
  }

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
  function avatarHtml(nome, baseCls, corFallback = "a") {
    const info2 = porNome.get(chave(nome));
    if (info2?.foto) {
      return `<span class="${baseCls} foto"><img src="${urlArquivo(info2.foto)}" alt="${nome}"></span>`;
    }
    return `<span class="${baseCls} ${info2?.cor ?? corFallback}">${iniciais(nome)}</span>`;
  }

  // src/web-dias.ts
  var HOJE = "2026-07-22";
  var MESES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var MESES = ["janeiro", "fevereiro", "mar\xE7o", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var WD = ["Domingo", "Segunda", "Ter\xE7a", "Quarta", "Quinta", "Sexta", "S\xE1bado"];
  function dataCurta(iso) {
    return `${iso.slice(8, 10)} ${MESES_ABBR[Number(iso.slice(5, 7)) - 1] ?? ""}`;
  }
  function dataLonga(iso) {
    const ano = Number(iso.slice(0, 4));
    const mes0 = Number(iso.slice(5, 7)) - 1;
    const dia = Number(iso.slice(8, 10));
    const wd = new Date(ano, mes0, dia).getDay();
    return `${WD[wd]}, ${dia} de ${MESES[mes0]}`;
  }
  var TECNICOS = ["Carlos Lima", "Rafael Gomes", "Jo\xE3o Pedro", "Maria Souza", "Ana Beatriz"];
  var DURACOES = [60, 120, 180, 240, 300, 480];
  var FUNC_INFO = {
    "Carlos Lima": { setor: "T\xE9cnico \u2014 Energia solar", cor: "b" },
    "Rafael Gomes": { setor: "Auxiliar t\xE9cnico", cor: "c" },
    "Jo\xE3o Pedro": { setor: "Eletricista", cor: "d" },
    "Maria Souza": { setor: "Engenheira eletricista", cor: "a" },
    "Ana Beatriz": { setor: "Comercial", cor: "a" }
  };
  function info(nome) {
    return FUNC_INFO[nome] ?? { setor: "Colaborador", cor: "a" };
  }
  var I = {
    cal: '<iconify-icon icon="ion:calendar-number-outline"></iconify-icon>',
    clock: '<iconify-icon icon="ion:time-outline"></iconify-icon>',
    users: '<iconify-icon icon="ion:people-outline"></iconify-icon>',
    coin: '<iconify-icon icon="ion:cash-outline"></iconify-icon>',
    check: '<iconify-icon icon="ion:checkmark-outline"></iconify-icon>',
    x: '<iconify-icon icon="ion:close-outline"></iconify-icon>',
    trash: '<iconify-icon icon="ion:trash-outline"></iconify-icon>',
    plus: '<iconify-icon icon="ion:add-outline"></iconify-icon>',
    chev: '<iconify-icon icon="ion:chevron-down-outline"></iconify-icon>'
  };
  var API_BASE2 = window.JC_API || "http://localhost:3000";
  var store = new DiasTrabalhadosStore([]);
  async function apiJornada(path, method, body) {
    try {
      const opt = { method, headers: { "Content-Type": "application/json" } };
      if (body !== void 0) opt.body = JSON.stringify(body);
      const r = await fetch(API_BASE2 + path, opt);
      return r.ok;
    } catch {
      return false;
    }
  }
  async function carregar() {
    try {
      const r = await fetch(API_BASE2 + "/api/jornadas");
      if (!r.ok) return;
      const arr = await r.json();
      store = new DiasTrabalhadosStore(arr.map((j) => ({ ...j, pago: !!j.pago })));
    } catch {
    }
  }
  function qs(s) {
    return document.querySelector(s);
  }
  function h(t, c, html) {
    const e = document.createElement(t);
    if (c) e.className = c;
    if (html !== void 0) e.innerHTML = html;
    return e;
  }
  function payBadge(pago) {
    return pago ? `<span class="apt-b ok">${I.check} Pago</span>` : `<span class="apt-b wait">A pagar</span>`;
  }
  var horasChart = null;
  var heroChart = null;
  var gaugeChart = null;
  var AXIS = { colors: "#6b7385", fontSize: "10px", fontWeight: 600 };
  var FUNC_CORES = ["#ef6300", "#34d399", "#5b8def", "#fbbf24", "#a78bfa", "#fb7185", "#38bdf8", "#94a3b8"];
  function apex() {
    return window.ApexCharts;
  }
  function vis(el) {
    return !!el && el.clientWidth > 4;
  }
  function renderHero() {
    const dias = store.totalDias();
    const aPagar = store.totalApagar();
    const v = qs("#dias-hero-val");
    const s = qs("#dias-hero-sub");
    if (v) v.textContent = formatarDuracao(store.totalMinutos());
    if (s) s.innerHTML = `<b>${dias}</b> ${dias === 1 ? "dia" : "dias"} trabalhados \xB7 <b style="color:#fbbf24">${aPagar}</b> a pagar`;
    const A = apex();
    if (!A) return;
    const hEl = qs("#dias-hero-chart");
    const pagos = Math.max(0, dias - aPagar);
    const series = [{ name: "Pagos", data: [pagos] }, { name: "A pagar", data: [aPagar] }];
    if (heroChart) heroChart.updateSeries(series);
    else if (vis(hEl)) {
      heroChart = new A(hEl, {
        chart: { type: "bar", height: 120, stacked: true, sparkline: { enabled: true }, fontFamily: "Inter, sans-serif" },
        series,
        colors: ["#34d399", "#fbbf24"],
        plotOptions: { bar: { horizontal: true, barHeight: "40%", borderRadius: 5 } },
        dataLabels: { enabled: false },
        stroke: { width: 0 },
        legend: { show: true, position: "bottom", fontSize: "11px", labels: { colors: "#98a1b3" }, markers: { radius: 3 } },
        tooltip: { theme: "dark", y: { formatter: (n) => `${n} ${n === 1 ? "dia" : "dias"}` } }
      });
      heroChart.render();
    }
  }
  function renderCharts() {
    const A = apex();
    if (!A) return;
    const rows = store.porFuncionario();
    const bEl = qs("#dias-horas");
    const nomes = rows.map((r) => r.funcionario.split(" ")[0]);
    const mins = rows.map((r) => r.minutos);
    const bSeries = [{ name: "Horas", data: mins }];
    if (horasChart) horasChart.updateOptions({ series: bSeries, xaxis: { categories: nomes }, colors: FUNC_CORES });
    else if (vis(bEl)) {
      horasChart = new A(bEl, {
        chart: { type: "bar", height: 230, toolbar: { show: false }, fontFamily: "Inter, sans-serif" },
        series: bSeries,
        colors: FUNC_CORES,
        plotOptions: { bar: { distributed: true, columnWidth: "46%", borderRadius: 8, borderRadiusApplication: "end", dataLabels: { position: "top" } } },
        fill: { type: "gradient", gradient: { shade: "light", type: "vertical", shadeIntensity: 0.18, opacityFrom: 1, opacityTo: 0.82, stops: [0, 100] } },
        dataLabels: { enabled: true, offsetY: -18, style: { colors: ["#cbd3e1"], fontSize: "11px", fontWeight: 700 }, formatter: (v) => formatarDuracao(v) },
        xaxis: { categories: nomes, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
        yaxis: { labels: { formatter: (v) => Math.round(v / 60) + "h", style: AXIS } },
        legend: { show: false },
        grid: { borderColor: "rgba(255,255,255,.05)", strokeDashArray: 4 },
        tooltip: { theme: "dark", y: { formatter: (v) => formatarDuracao(v) } }
      });
      horasChart.render();
    }
    const gEl = qs("#dias-gauge");
    const dias = store.totalDias();
    const pagosDias = Math.max(0, dias - store.totalApagar());
    const pct = dias > 0 ? Math.round(pagosDias / dias * 100) : 0;
    if (gaugeChart) gaugeChart.updateSeries([pct]);
    else if (vis(gEl)) {
      gaugeChart = new A(gEl, {
        chart: { type: "radialBar", height: 210, fontFamily: "Inter, sans-serif" },
        series: [pct],
        labels: ["dias pagos"],
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
    const gSub = qs("#dias-gauge-sub");
    if (gSub) gSub.innerHTML = `<div><small>Pagos</small><b style="color:var(--pos)">${pagosDias}</b></div><div><small>A pagar</small><b style="color:#fbbf24">${store.totalApagar()}</b></div>`;
  }
  async function refresh() {
    await carregar();
    render();
    renderHero();
    renderCharts();
  }
  function render() {
    const sum = qs("#dias-sum");
    if (sum) {
      sum.innerHTML = `<div class="sumcard card" data-tip="Total de dias com jornada registrada no m\xEAs"><span class="si acc">${I.cal}</span><div class="sc-info"><small>Dias trabalhados</small><b data-count="${store.totalDias()}" data-fmt="int" data-ck="dias-total">${store.totalDias()}</b></div></div><div class="sumcard card" data-tip="Soma das horas de todas as jornadas"><span class="si green">${I.clock}</span><div class="sc-info"><small>Horas registradas</small><b data-count="${store.totalMinutos()}" data-fmt="horas" data-ck="dias-horas">${formatarDuracao(store.totalMinutos())}</b></div></div><div class="sumcard card" data-tip="Dias trabalhados ainda n\xE3o pagos"><span class="si red">${I.coin}</span><div class="sc-info"><small>Dias a pagar</small><b data-count="${store.totalApagar()}" data-fmt="int" data-ck="dias-apagar">${store.totalApagar()}</b></div></div>`;
    }
    const list = qs("#dias-list");
    if (!list) return;
    list.innerHTML = "";
    for (const r of store.porFuncionario()) {
      const inf = info(r.funcionario);
      const card = h("section", "emp card");
      card.setAttribute("data-search", `${r.funcionario} ${inf.setor} ${r.jornadas.map((j) => j.servico + " " + j.cliente).join(" ")}`.toLowerCase());
      const linhas = r.jornadas.map((j) => {
        const novo = "";
        return `<div class="empday" data-id="${j.id}"><span class="ed-date">${dataCurta(j.data)}</span><div class="ed-main"><b>${j.servico}${novo}</b><small>${j.cliente}</small></div>${payBadge(j.pago)}<span class="ed-dur">${formatarDuracao(j.duracaoMin)}</span></div>`;
      }).join("");
      card.innerHTML = `<div class="emp-head">${avatarHtml(r.funcionario, "emp-av", inf.cor)}<div class="emp-id"><b>${r.funcionario}</b><small>${inf.setor}</small></div><div class="emp-stats"><div><b>${r.dias}</b><small>${r.dias === 1 ? "dia" : "dias"}</small></div><div><b>${formatarDuracao(r.minutos)}</b><small>horas</small></div><div><b>${r.aPagar}</b><small>a pagar</small></div></div></div><div class="emp-days">${linhas}</div>`;
      list.appendChild(card);
    }
    list.querySelectorAll(".empday").forEach((row) => {
      row.addEventListener("click", () => abrirDetalhe(row.getAttribute("data-id")));
    });
  }
  function abrirDetalhe(id) {
    const j = store.buscar(id);
    if (!j) return;
    const body = qs("#jor-body");
    const foot = qs("#jor-foot");
    if (!body || !foot) return;
    body.innerHTML = `<div class="mrow"><span>Colaborador</span><b>${j.funcionario}</b></div><div class="mrow"><span>Data</span><b>${dataLonga(j.data)}</b></div><div class="mrow"><span>Servi\xE7o</span><b>${j.servico}</b></div><div class="mrow"><span>Cliente</span><b>${j.cliente}</b></div><div class="mrow"><span>Dura\xE7\xE3o</span><b>${formatarDuracao(j.duracaoMin)}</b></div><div class="mrow"><span>Pagamento</span><b>${payBadge(j.pago)}</b></div>`;
    foot.innerHTML = "";
    const del = h("button", "btn btn-ghost danger", `${I.trash} Excluir`);
    del.addEventListener("click", () => {
      void (async () => {
        const ok = await apiJornada("/api/jornadas/" + id, "DELETE");
        if (!ok) {
          toast("N\xE3o foi poss\xEDvel excluir");
          return;
        }
        await carregar();
        fechar();
        render();
        renderHero();
        renderCharts();
        toast("Dia trabalhado exclu\xEDdo");
      })();
    });
    const pay = h("button", "btn btn-primary", j.pago ? `${I.coin} Marcar como a pagar` : `${I.check} Marcar como pago`);
    pay.addEventListener("click", () => {
      void (async () => {
        const ok = await apiJornada("/api/jornadas/" + id + "/pagar", "POST", { pago: !j.pago });
        if (!ok) {
          toast("N\xE3o foi poss\xEDvel atualizar");
          return;
        }
        await carregar();
        render();
        renderHero();
        renderCharts();
        abrirDetalhe(id);
        toast(j.pago ? "Marcado como a pagar" : "Pagamento registrado");
      })();
    });
    foot.appendChild(del);
    foot.appendChild(pay);
    document.body.classList.remove("reg-open");
    document.body.classList.add("jornada-open");
  }
  function abrirRegistro() {
    document.body.classList.remove("jornada-open");
    document.body.classList.add("reg-open");
    setPagoReg(false);
  }
  function setPagoReg(pago) {
    qs("#reg-pago").classList.toggle("on", pago);
    qs("#reg-apagar").classList.toggle("on", !pago);
    qs("#m-reg").setAttribute("data-pago", pago ? "1" : "0");
  }
  async function salvarRegistro() {
    const funcionario = qs("#reg-func").value;
    const data = qs("#reg-data").value;
    const servico = qs("#reg-serv").value.trim();
    const cliente = qs("#reg-cli").value.trim();
    const duracaoMin = Number(qs("#reg-dur").value);
    const pago = qs("#m-reg").getAttribute("data-pago") === "1";
    const erro = qs("#reg-erro");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || servico === "") {
      erro.style.display = "block";
      erro.textContent = "Informe a data e a atividade.";
      return;
    }
    erro.style.display = "none";
    const nova = { funcionario, data, servico, cliente: cliente || "\u2014", duracaoMin, pago };
    const ok = await apiJornada("/api/jornadas", "POST", nova);
    if (!ok) {
      erro.style.display = "block";
      erro.textContent = "N\xE3o foi poss\xEDvel registrar. Verifique os dados e tente novamente.";
      return;
    }
    await carregar();
    fechar();
    render();
    renderHero();
    renderCharts();
    toast(`Dia registrado para ${funcionario}`);
  }
  function fechar() {
    document.body.classList.remove("jornada-open", "reg-open");
  }
  function toast(msg) {
    const t = qs("#dias-toast");
    if (!t) return;
    t.querySelector("span").textContent = msg;
    document.body.classList.add("toast-open");
    window.setTimeout(() => document.body.classList.remove("toast-open"), 2600);
  }
  function montar() {
    const funcOpts = TECNICOS.map((t) => `<option value="${t}">${t}</option>`).join("");
    const durOpts = DURACOES.map((d) => `<option value="${d}">${formatarDuracao(d)}</option>`).join("");
    const wrap = h("div", "");
    wrap.innerHTML = `
  <div class="modal-wrap" id="m-jornada"><div class="modal">
    <div class="modal-head"><h3>Dia trabalhado</h3><button class="mclose" data-close>${I.x}</button></div>
    <div class="modal-body" id="jor-body"></div>
    <div class="modal-foot" id="jor-foot"></div>
  </div></div>

  <div class="modal-wrap" id="m-reg"><div class="modal modal-lg" data-pago="0">
    <div class="modal-head"><h3>Registrar dia trabalhado</h3><button class="mclose" data-close>${I.x}</button></div>
    <div class="modal-body">
      <div id="reg-erro" class="f-erros" style="display:none"></div>
      <div class="form-grid">
        <div class="field"><label>Colaborador</label><div class="selwrap">${I.chev}<select class="sel selnat" id="reg-func">${funcOpts}</select></div></div>
        <div class="field"><label>Data</label><input class="inp" id="reg-data" type="date" value="${HOJE}"></div>
      </div>
      <div class="field span2"><label>Atividade / servi\xE7o</label><input class="inp" id="reg-serv" placeholder="Ex.: Instala\xE7\xE3o de pain\xE9is solares"></div>
      <div class="form-grid">
        <div class="field"><label>Cliente / local</label><input class="inp" id="reg-cli" placeholder="Opcional"></div>
        <div class="field"><label>Dura\xE7\xE3o</label><div class="selwrap">${I.chev}<select class="sel selnat" id="reg-dur">${durOpts}</select></div></div>
      </div>
      <label class="fl">Pagamento</label>
      <div class="seg"><button class="seg-btn waitc on" id="reg-apagar">${I.coin} A pagar</button><button class="seg-btn okc" id="reg-pago">${I.check} Pago</button></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="reg-salvar">${I.check} Registrar</button></div>
  </div></div>

  <div class="toast" id="dias-toast">${I.check}<span>Salvo</span></div>`;
    document.body.appendChild(wrap);
    document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", fechar));
    qs("#m-jornada").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) fechar();
    });
    qs("#m-reg").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) fechar();
    });
    qs("#reg-pago").addEventListener("click", () => setPagoReg(true));
    qs("#reg-apagar").addEventListener("click", () => setPagoReg(false));
    qs("#reg-salvar").addEventListener("click", () => void salvarRegistro());
    const btn = qs(".ph-actions .btn-primary");
    if (btn) btn.addEventListener("click", abrirRegistro);
    const fab = qs("#dias-fab");
    if (fab) fab.addEventListener("click", abrirRegistro);
  }
  async function boot() {
    montar();
    await carregarFuncionarios();
    await carregar();
    render();
    renderHero();
    renderCharts();
    window.setInterval(() => {
      void refresh();
    }, 6e4);
    window.addEventListener("jc:mudou", () => {
      void refresh();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else void boot();
})();

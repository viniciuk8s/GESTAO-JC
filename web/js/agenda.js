"use strict";
var Agenda = (() => {
  // src/agendamentos.ts
  var MIN_POR_DIA = 24 * 60;
  var RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
  var RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
  function ehDataValida(data) {
    const m = RE_DATA.exec(data);
    if (!m) return false;
    const ano = Number(m[1]);
    const mes = Number(m[2]);
    const dia = Number(m[3]);
    if (mes < 1 || mes > 12) return false;
    if (dia < 1 || dia > diasNoMes(ano, mes)) return false;
    return true;
  }
  function diasNoMes(ano, mes) {
    const bissexto = ano % 4 === 0 && ano % 100 !== 0 || ano % 400 === 0;
    const dias = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return dias[mes - 1] ?? 0;
  }
  function minutosDoDia(hora) {
    const m = RE_HORA.exec(hora);
    if (!m) throw new RangeError(`Hor\xE1rio inv\xE1lido: "${hora}" (esperado HH:MM)`);
    return Number(m[1]) * 60 + Number(m[2]);
  }
  function horaDeMinutos(min) {
    if (!Number.isInteger(min) || min < 0 || min > MIN_POR_DIA) {
      throw new RangeError(`Minutos fora do intervalo do dia: ${min}`);
    }
    const h2 = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h2).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  function intervaloDoServico(s) {
    const inicioMin = minutosDoDia(s.inicio);
    return { inicioMin, fimMin: inicioMin + s.duracaoMin };
  }
  function minutosDeSobreposicao(a, b) {
    const inicio = Math.max(a.inicioMin, b.inicioMin);
    const fim = Math.min(a.fimMin, b.fimMin);
    return Math.max(0, fim - inicio);
  }
  function ocupaAgenda(s) {
    return s.situacao !== "cancelado";
  }
  function conflitosNoDia(servicos2) {
    const ativos2 = servicos2.filter(ocupaAgenda);
    const conflitos = [];
    for (let i = 0; i < ativos2.length; i++) {
      for (let j = i + 1; j < ativos2.length; j++) {
        const a = ativos2[i];
        const b = ativos2[j];
        if (a.data !== b.data) continue;
        const ia = intervaloDoServico(a);
        const ib = intervaloDoServico(b);
        const mins = minutosDeSobreposicao(ia, ib);
        if (mins > 0) {
          conflitos.push({
            a,
            b,
            inicioMin: Math.max(ia.inicioMin, ib.inicioMin),
            fimMin: Math.min(ia.fimMin, ib.fimMin),
            minutos: mins
          });
        }
      }
    }
    return conflitos;
  }
  function conflitosDoCandidato(candidato, doDia2) {
    if (!ocupaAgenda(candidato)) return [];
    const alvo = intervaloDoServico(candidato);
    return doDia2.filter((s) => {
      if (s.id === candidato.id) return false;
      if (s.data !== candidato.data) return false;
      if (!ocupaAgenda(s)) return false;
      return minutosDeSobreposicao(alvo, intervaloDoServico(s)) > 0;
    });
  }
  function validarServico(s) {
    const erros = [];
    if (!s || typeof s !== "object") return { ok: false, erros: ["Dados inv\xE1lidos."] };
    if (!ehDataValida(s.data)) erros.push("Data inv\xE1lida.");
    if (typeof s.titulo !== "string" || s.titulo.trim() === "") erros.push("Informe o servi\xE7o.");
    if (typeof s.cliente !== "string" || s.cliente.trim() === "") erros.push("Informe o cliente.");
    if (!RE_HORA.test(s.inicio)) erros.push("Hor\xE1rio inv\xE1lido.");
    if (!Number.isInteger(s.duracaoMin) || s.duracaoMin <= 0) {
      erros.push("Dura\xE7\xE3o deve ser maior que zero.");
    }
    if (!Number.isInteger(s.valorCentavos) || s.valorCentavos < 0) {
      erros.push("Valor inv\xE1lido.");
    }
    if (RE_HORA.test(s.inicio) && Number.isInteger(s.duracaoMin) && s.duracaoMin > 0) {
      if (minutosDoDia(s.inicio) + s.duracaoMin > MIN_POR_DIA) {
        erros.push("O servi\xE7o ultrapassa o fim do dia.");
      }
    }
    return { ok: erros.length === 0, erros };
  }
  function ehPassado(data, hoje) {
    return data < hoje;
  }
  function estadoDaData(data, hoje, servicosDoDia) {
    const ordenados = [...servicosDoDia].sort((a, b) => minutosDoDia(a.inicio) - minutosDoDia(b.inicio));
    const passado = ehPassado(data, hoje);
    if (ordenados.length === 0) {
      return passado ? { tipo: "vazio-passado" } : { tipo: "vazio-futuro" };
    }
    return passado ? { tipo: "preenchido-passado", servicos: ordenados } : { tipo: "preenchido-futuro", servicos: ordenados };
  }
  function acoesPara(estado) {
    switch (estado.tipo) {
      case "vazio-futuro":
        return { podeCriar: true, podeEditar: false, podeRemover: false };
      case "preenchido-futuro":
        return { podeCriar: true, podeEditar: true, podeRemover: true };
      case "vazio-passado":
        return { podeCriar: false, podeEditar: false, podeRemover: false };
      case "preenchido-passado":
        return { podeCriar: false, podeEditar: true, podeRemover: true };
    }
  }
  function formatarBRL(centavos) {
    const negativo = centavos < 0;
    const total = Math.abs(Math.trunc(centavos));
    const reais = Math.floor(total / 100);
    const cent = total % 100;
    const s = String(reais);
    let agrupado = "";
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) agrupado += ".";
      agrupado += s[i];
    }
    return `${negativo ? "-" : ""}R$ ${agrupado},${String(cent).padStart(2, "0")}`;
  }
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
    const info = porNome.get(chave(nome));
    if (info?.foto) {
      return `<span class="${baseCls} foto"><img src="${urlArquivo(info.foto)}" alt="${nome}"></span>`;
    }
    return `<span class="${baseCls} ${info?.cor ?? corFallback}">${iniciais(nome)}</span>`;
  }

  // src/web.ts
  var API_BASE2 = window.JC_API || "http://localhost:3000";
  var HOJE = "2026-07-22";
  var WD_LONGO = ["Domingo", "Segunda", "Ter\xE7a", "Quarta", "Quinta", "Sexta", "S\xE1bado"];
  var WD_CURTO = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
  var MESES = ["janeiro", "fevereiro", "mar\xE7o", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var anoAtual = 2026;
  var mesAtual = 6;
  var semanaRef = new Date(2026, 6, 22);
  var pad2 = (n) => String(n).padStart(2, "0");
  function iso(ano, mes0, dia) {
    return `${ano}-${pad2(mes0 + 1)}-${pad2(dia)}`;
  }
  function partesDoIso(s) {
    return { ano: Number(s.slice(0, 4)), mes0: Number(s.slice(5, 7)) - 1, dia: Number(s.slice(8, 10)) };
  }
  function diaDaSemanaIso(s) {
    const p = partesDoIso(s);
    return new Date(p.ano, p.mes0, p.dia).getDay();
  }
  function rotuloData(s) {
    const p = partesDoIso(s);
    return `${WD_LONGO[diaDaSemanaIso(s)]}, ${p.dia} de ${MESES[p.mes0]}`;
  }
  function cap(txt) {
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }
  var I = {
    pin: '<iconify-icon icon="ion:location-outline"></iconify-icon>',
    clock: '<iconify-icon icon="ion:time-outline"></iconify-icon>',
    pencil: '<iconify-icon icon="ion:create-outline"></iconify-icon>',
    trash: '<iconify-icon icon="ion:trash-outline"></iconify-icon>',
    plus: '<iconify-icon icon="ion:add-outline"></iconify-icon>',
    x: '<iconify-icon icon="ion:close-outline"></iconify-icon>',
    check: '<iconify-icon icon="ion:checkmark-outline"></iconify-icon>',
    alert: '<iconify-icon icon="ion:warning-outline"></iconify-icon>',
    chev: '<iconify-icon icon="ion:chevron-down-outline"></iconify-icon>',
    cal: '<iconify-icon icon="ion:calendar-outline"></iconify-icon>',
    calday: '<iconify-icon icon="ion:calendar-outline"></iconify-icon>',
    wallet: '<iconify-icon icon="ion:wallet-outline"></iconify-icon>'
  };
  var servicos = [];
  var online = false;
  function todos() {
    return servicos;
  }
  function doDia(isoD) {
    return servicos.filter((s) => s.data === isoD).sort((a, b) => minutosDoDia(a.inicio) - minutosDoDia(b.inicio));
  }
  function buscar(id) {
    return servicos.find((s) => s.id === id);
  }
  async function carregarServicos() {
    try {
      const r = await fetch(`${API_BASE2}/api/agendamentos`);
      if (!r.ok) throw new Error("api");
      servicos = await r.json();
      online = true;
    } catch {
      online = false;
    }
  }
  async function apiSalvarServico(dados, forcar, id) {
    const url = id ? `${API_BASE2}/api/agendamentos/${id}` : `${API_BASE2}/api/agendamentos`;
    try {
      const r = await fetch(url, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...dados, forcar }) });
      if (r.ok) return { ok: true, status: r.status };
      const j = await r.json().catch(() => ({}));
      const out = { ok: false, status: r.status };
      if (j.erros) out.erros = j.erros;
      return out;
    } catch {
      return { ok: false, status: 0, erros: ["API offline \u2014 inicie a API e tente novamente."] };
    }
  }
  async function apiRemoverServico(id) {
    try {
      await fetch(`${API_BASE2}/api/agendamentos/${id}`, { method: "DELETE" });
    } catch {
    }
  }
  async function apiConcluirServico(id) {
    try {
      const r = await fetch(`${API_BASE2}/api/agendamentos/${id}/concluir`, { method: "POST" });
      if (!r.ok) return { ok: false, temJornada: false, tecnico: "" };
      const j = await r.json();
      return { ok: true, temJornada: !!j.jornada, tecnico: j.servico?.tecnico ?? "" };
    } catch {
      return { ok: false, temJornada: false, tecnico: "" };
    }
  }
  var TECNICOS = ["Carlos Lima", "Rafael Gomes", "Jo\xE3o Pedro", "Maria Souza", "Ana Beatriz"];
  var DURACOES = [30, 60, 90, 120, 180, 240];
  function h(tag, cls, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html !== void 0) el.innerHTML = html;
    return el;
  }
  function qs(sel, root = document) {
    return root.querySelector(sel);
  }
  function parseCentavosBR(v) {
    const limpo = v.replace(/[^\d,]/g, "");
    if (limpo === "") return 0;
    const [reais, cent = ""] = limpo.split(",");
    const c = (cent + "00").slice(0, 2);
    return Number((reais || "0").replace(/\D/g, "")) * 100 + Number(c);
  }
  var diaSelecionado = HOJE;
  function statusDoDia(isoD) {
    const ativos2 = doDia(isoD).filter((s) => s.situacao !== "cancelado");
    if (ativos2.length === 0) return null;
    return ativos2.some((s) => s.situacao === "pendente") ? "wait" : "ok";
  }
  function pontoHtml(isoD, semana) {
    const st = statusDoDia(isoD);
    if (!st) return "";
    return `<span class="${semana ? "wdot" : "cdot"} ${st}"></span>`;
  }
  function renderCalendario() {
    const card = qs(".cal-card");
    if (!card) return;
    const hb = qs(".cal-head b");
    if (hb) hb.textContent = `${cap(MESES[mesAtual])} ${anoAtual}`;
    const cal = qs(".cal");
    if (cal) {
      let html = ["D", "S", "T", "Q", "Q", "S", "S"].map((c) => `<span class="cah">${c}</span>`).join("");
      const primeiro = new Date(anoAtual, mesAtual, 1).getDay();
      const dias = new Date(anoAtual, mesAtual + 1, 0).getDate();
      for (let i = 0; i < primeiro; i++) html += '<span class="cd mut"></span>';
      for (let d = 1; d <= dias; d++) {
        const isoD = iso(anoAtual, mesAtual, d);
        const sel = isoD === diaSelecionado;
        const st = statusDoDia(isoD);
        const cls = "cd" + (sel ? " sel" : st ? " has" : "");
        html += `<span class="${cls}" data-iso="${isoD}">${d}${pontoHtml(isoD, false)}</span>`;
      }
      const resto = (7 - (primeiro + dias) % 7) % 7;
      for (let i = 0; i < resto; i++) html += '<span class="cd mut"></span>';
      cal.innerHTML = html;
    }
    const ws = qs(".weekstrip");
    if (ws) {
      const inicio = new Date(semanaRef);
      inicio.setDate(inicio.getDate() - inicio.getDay());
      let html = "";
      for (let i = 0; i < 7; i++) {
        const dt = new Date(inicio);
        dt.setDate(inicio.getDate() + i);
        const isoD = iso(dt.getFullYear(), dt.getMonth(), dt.getDate());
        const sel = isoD === diaSelecionado;
        html += `<button class="wday${sel ? " sel" : ""}" data-iso="${isoD}"><small>${WD_CURTO[i]}</small><b>${dt.getDate()}</b>${pontoHtml(isoD, true)}</button>`;
      }
      ws.innerHTML = html;
    }
    card.querySelectorAll(".cal .cd[data-iso], .weekstrip .wday[data-iso]").forEach((el) => {
      el.addEventListener("click", () => abrirDia(el.getAttribute("data-iso")));
    });
  }
  function navegar(delta) {
    const card = qs(".cal-card");
    const view = card?.getAttribute("data-view") ?? "month";
    if (view === "week") {
      semanaRef.setDate(semanaRef.getDate() + delta * 7);
      anoAtual = semanaRef.getFullYear();
      mesAtual = semanaRef.getMonth();
    } else {
      mesAtual += delta;
      if (mesAtual < 0) {
        mesAtual = 11;
        anoAtual -= 1;
      }
      if (mesAtual > 11) {
        mesAtual = 0;
        anoAtual += 1;
      }
    }
    renderCalendario();
  }
  function statusLabel(s) {
    return s === "confirmado" ? "Confirmado" : s === "pendente" ? "Pendente" : s === "concluido" ? "Conclu\xEDdo" : "Cancelado";
  }
  function statusCls(s) {
    return s === "confirmado" ? "ok" : s === "pendente" ? "wait" : s === "concluido" ? "done" : "cancel";
  }
  function renderAgendaLateral(iso2) {
    const card = qs(".agenda-card");
    if (!card) return;
    const servicos2 = doDia(iso2);
    const total = servicos2.filter((s) => s.situacao !== "cancelado").reduce((a, s) => a + s.valorCentavos, 0);
    const head = qs(".ag-dayhead", card);
    if (head) {
      head.innerHTML = `<div><b>${rotuloData(iso2).replace(",", ",")}</b><small>${servicos2.length} ${servicos2.length === 1 ? "servi\xE7o agendado" : "servi\xE7os agendados"}</small></div><span class="ag-total">${formatarBRL(total)}</span>`;
    }
    const lista = qs(".agenda-list", card);
    if (!lista) return;
    lista.innerHTML = "";
    if (servicos2.length === 0) {
      lista.appendChild(h("div", "day-empty", `${I.cal}<p>Nenhum servi\xE7o neste dia.</p>`));
      return;
    }
    const emConflito = /* @__PURE__ */ new Set();
    for (const c of conflitosNoDia(servicos2)) {
      emConflito.add(c.a.id);
      emConflito.add(c.b.id);
    }
    for (const s of servicos2) {
      const cls = statusCls(s.situacao);
      const conflitoTag = emConflito.has(s.id) ? `<span class="apt-b cancel">${I.alert} Conflito</span>` : "";
      const row = h("div", "appt");
      row.innerHTML = `<div class="appt-time"><b>${s.inicio}</b><small>${formatarDuracao(s.duracaoMin)}</small></div><span class="appt-dot ${cls}"></span><div class="appt-card"><div class="appt-top"><b>${s.titulo}</b><div class="appt-badges"><span class="apt-b ${cls}">${statusLabel(s.situacao)}</span>${conflitoTag}</div></div><div class="appt-sub">${I.pin}<span>${s.cliente}</span></div><div class="appt-foot"><span class="appt-team">${avatarHtml(s.tecnico, "av", avCor(s.tecnico))}${s.tecnico}</span><span class="appt-val">${formatarBRL(s.valorCentavos)}</span></div></div>`;
      lista.appendChild(row);
    }
  }
  function avCor(nome) {
    const cores = ["a", "b", "c", "d"];
    let soma = 0;
    for (let i = 0; i < nome.length; i++) soma += nome.charCodeAt(i);
    return cores[soma % cores.length];
  }
  function abrirDia(isoD) {
    diaSelecionado = isoD;
    const p = partesDoIso(isoD);
    anoAtual = p.ano;
    mesAtual = p.mes0;
    semanaRef = new Date(p.ano, p.mes0, p.dia);
    renderCalendario();
    renderAgendaLateral(isoD);
    const servicos2 = doDia(isoD);
    const estado = estadoDaData(isoD, HOJE, servicos2);
    const acoes = acoesPara(estado);
    const passado = estado.tipo === "vazio-passado" || estado.tipo === "preenchido-passado";
    const body = qs("#day-body");
    const foot = qs("#day-foot");
    const title = qs("#day-title");
    if (!body || !foot || !title) return;
    title.textContent = rotuloData(isoD);
    body.innerHTML = "";
    if (passado) {
      body.appendChild(h("div", "past-note", `${I.clock}<div>Data no passado \u2014 os servi\xE7os podem ser <b>atualizados</b> ou <b>removidos</b>, mas n\xE3o \xE9 poss\xEDvel criar novos.</div>`));
    }
    if (servicos2.length === 0) {
      body.appendChild(
        h("div", "day-empty", `${I.cal}<p>${passado ? "Nenhum servi\xE7o registrado neste dia." : "Nenhum servi\xE7o agendado.<br>Adicione o primeiro servi\xE7o deste dia."}</p>`)
      );
    } else {
      const emConflito = /* @__PURE__ */ new Set();
      for (const c of conflitosNoDia(servicos2)) {
        emConflito.add(c.a.id);
        emConflito.add(c.b.id);
      }
      const lista = h("div", "daylist");
      for (const s of servicos2) {
        const cls = statusCls(s.situacao);
        const row = h("div", "daysvc" + (emConflito.has(s.id) ? " conflita" : ""));
        row.setAttribute("data-id", s.id);
        const conflitoTag = emConflito.has(s.id) ? `<span class="apt-b cancel">${I.alert} Conflito</span>` : "";
        const podeFinalizar = acoes.podeEditar && s.situacao !== "concluido" && s.situacao !== "cancelado";
        row.innerHTML = `<div class="dsvc-time"><b>${s.inicio}</b><small>${formatarDuracao(s.duracaoMin)}</small></div><div class="dsvc-main"><div class="dsvc-top"><b>${s.titulo}</b><span class="apt-b ${cls}">${statusLabel(s.situacao)}</span>${conflitoTag}</div><div class="dsvc-sub">${I.pin} ${s.cliente} \xB7 ${s.tecnico}</div><div class="dsvc-val">${formatarBRL(s.valorCentavos)}</div></div><div class="dsvc-acts">${podeFinalizar ? `<button class="mini-act done" data-act="fin" title="Finalizar servi\xE7o">${I.check}</button>` : ""}${acoes.podeEditar ? `<button class="mini-act" data-act="edit" title="Editar">${I.pencil}</button>` : ""}${acoes.podeRemover ? `<button class="mini-act danger" data-act="del" title="Remover">${I.trash}</button>` : ""}</div>`;
        lista.appendChild(row);
      }
      body.appendChild(lista);
    }
    foot.innerHTML = "";
    if (acoes.podeCriar) {
      const btn = h("button", "btn btn-primary", `${I.plus} Novo servi\xE7o`);
      btn.addEventListener("click", () => abrirForm("criar", isoD));
      foot.appendChild(btn);
    } else {
      const btn = h("button", "btn btn-ghost", "Fechar");
      btn.addEventListener("click", fecharTudo);
      foot.appendChild(btn);
    }
    body.querySelectorAll(".daysvc").forEach((row) => {
      const id = row.getAttribute("data-id");
      row.querySelectorAll(".mini-act").forEach((b) => {
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const act = b.getAttribute("data-act");
          if (act === "edit") abrirForm("editar", isoD, buscar(id));
          else if (act === "del") void removerServico(id, isoD);
          else if (act === "fin") void finalizarServico(id, isoD);
        });
      });
    });
    document.body.classList.remove("form-open");
    document.body.classList.add("day-open");
  }
  async function finalizarServico(id, isoD) {
    const r = await apiConcluirServico(id);
    if (!r.ok) {
      toast("N\xE3o foi poss\xEDvel concluir o servi\xE7o");
      return;
    }
    await carregarServicos();
    renderCalendario();
    abrirDia(isoD);
    toast(r.temJornada ? `Dia de trabalho de ${r.tecnico} registrado` : "Servi\xE7o conclu\xEDdo");
  }
  async function removerServico(id, isoD) {
    await apiRemoverServico(id);
    await carregarServicos();
    renderCalendario();
    abrirDia(isoD);
  }
  var formCtx = { modo: "criar", iso: HOJE, forcar: false };
  function sugestaoInicio(iso2) {
    const lista = doDia(iso2);
    if (lista.length === 0) return "09:00";
    const ultimoFim = Math.max(...lista.map((s) => minutosDoDia(s.inicio) + s.duracaoMin));
    return horaDeMinutos(Math.min(ultimoFim, 23 * 60));
  }
  function abrirForm(modo, iso2, servico) {
    formCtx = { modo, iso: iso2, forcar: false };
    if (servico) formCtx.id = servico.id;
    const titulo = qs("#form-title");
    if (titulo) titulo.textContent = modo === "criar" ? "Novo agendamento" : "Editar agendamento";
    const val = (sel) => qs(sel);
    qs("#f-data").firstChild.nodeValue = rotuloData(iso2) + " ";
    qs("#f-data").setAttribute("data-iso", iso2);
    val("#f-titulo").value = servico?.titulo ?? "";
    val("#f-cliente").value = servico?.cliente ?? "";
    val("#f-inicio").value = servico?.inicio ?? sugestaoInicio(iso2);
    qs("#f-duracao").value = String(servico?.duracaoMin ?? 120);
    qs("#f-tecnico").value = servico?.tecnico ?? TECNICOS[0];
    val("#f-valor").value = servico ? formatarBRL(servico.valorCentavos).replace("R$ ", "") : "";
    setSituacao(servico?.situacao === "pendente" ? "pendente" : "confirmado");
    const del = qs("#f-del");
    del.style.display = modo === "editar" ? "" : "none";
    atualizarConflito();
    document.body.classList.remove("day-open");
    document.body.classList.add("form-open");
  }
  function setSituacao(s) {
    qs("#f-sit-ok").classList.toggle("on", s === "confirmado");
    qs("#f-sit-wait").classList.toggle("on", s === "pendente");
    qs("#m-form").setAttribute("data-sit", s);
  }
  function getSituacao() {
    return qs("#m-form").getAttribute("data-sit") ?? "confirmado";
  }
  function lerForm() {
    return {
      data: qs("#f-data").getAttribute("data-iso"),
      titulo: qs("#f-titulo").value,
      cliente: qs("#f-cliente").value,
      inicio: qs("#f-inicio").value,
      duracaoMin: Number(qs("#f-duracao").value),
      tecnico: qs("#f-tecnico").value,
      valorCentavos: parseCentavosBR(qs("#f-valor").value),
      situacao: getSituacao()
    };
  }
  function atualizarConflito() {
    const banner = qs("#f-conflito");
    const inicio = qs("#f-inicio").value;
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(inicio)) {
      banner.style.display = "none";
      return;
    }
    const iso2 = qs("#f-data").getAttribute("data-iso");
    const candidato = { data: iso2, inicio, duracaoMin: Number(qs("#f-duracao").value), situacao: getSituacao() };
    const conflitos = conflitosDoCandidato(
      formCtx.id ? { ...candidato, id: formCtx.id } : candidato,
      doDia(iso2)
    );
    if (conflitos.length === 0) {
      banner.style.display = "none";
      formCtx.forcar = false;
      return;
    }
    const lista = conflitos.map((c) => `${c.inicio}\u2013${horaDeMinutos(minutosDoDia(c.inicio) + c.duracaoMin)} \xB7 ${c.titulo}`).join("<br>");
    banner.style.display = "flex";
    banner.innerHTML = `<span class="cf-ic">${I.alert}</span><div class="cf-txt"><b>Conflito de hor\xE1rio</b><small>Sobrep\xF5e: ${lista}</small></div><button class="cf-force" id="f-force">Agendar mesmo assim</button>`;
    qs("#f-force").addEventListener("click", () => {
      formCtx.forcar = true;
      void salvar();
    });
  }
  async function salvar() {
    const dados = lerForm();
    const v = validarServico(dados);
    const erroBox = qs("#f-erros");
    if (!v.ok) {
      erroBox.style.display = "block";
      erroBox.textContent = v.erros.join(" ");
      return;
    }
    erroBox.style.display = "none";
    const r = await apiSalvarServico(dados, formCtx.forcar, formCtx.modo === "editar" ? formCtx.id : void 0);
    if (!r.ok) {
      if (r.status === 409) {
        atualizarConflito();
        return;
      }
      erroBox.style.display = "block";
      erroBox.textContent = r.erros && r.erros.join(" ") || "N\xE3o foi poss\xEDvel salvar.";
      return;
    }
    await carregarServicos();
    renderCalendario();
    abrirDia(formCtx.iso);
    toast(formCtx.modo === "criar" ? "Servi\xE7o agendado com sucesso" : "Agendamento atualizado");
  }
  function toast(msg) {
    const t = qs("#ag-toast");
    if (!t) return;
    t.querySelector("span").textContent = msg;
    document.body.classList.add("toast-open");
    window.setTimeout(() => document.body.classList.remove("toast-open"), 2600);
  }
  function fecharTudo() {
    document.body.classList.remove("day-open", "form-open");
  }
  function montarModais() {
    const dur = DURACOES.map((d) => `<option value="${d}">${formatarDuracao(d)}</option>`).join("");
    const tec = TECNICOS.map((t) => `<option value="${t}">${t}</option>`).join("");
    const wrap = h("div", "");
    wrap.innerHTML = `
  <div class="modal-wrap" id="m-day"><div class="modal">
    <div class="modal-head"><h3 id="day-title">Dia</h3><button class="mclose" data-close>${I.x}</button></div>
    <div class="modal-body" id="day-body"></div>
    <div class="modal-foot" id="day-foot"></div>
  </div></div>

  <div class="modal-wrap" id="m-form"><div class="modal modal-lg" data-sit="confirmado">
    <div class="modal-head"><h3 id="form-title">Novo agendamento</h3><button class="mclose" data-close>${I.x}</button></div>
    <div class="modal-body">
      <div id="f-conflito" class="cf-banner" style="display:none"></div>
      <div id="f-erros" class="f-erros" style="display:none"></div>
      <label class="fl">Data e hor\xE1rio</label>
      <div class="form-grid">
        <div class="field"><label>Data</label><div class="sel" id="f-data" data-iso="">Data ${I.cal}</div></div>
        <div class="field"><label>In\xEDcio</label><input class="inp" id="f-inicio" placeholder="09:00" maxlength="5"></div>
      </div>
      <div class="field span2"><label>Servi\xE7o</label><input class="inp" id="f-titulo" placeholder="Ex.: Instala\xE7\xE3o de pain\xE9is solares"></div>
      <div class="form-grid">
        <div class="field"><label>Cliente</label><input class="inp" id="f-cliente" placeholder="Nome do cliente"></div>
        <div class="field"><label>Dura\xE7\xE3o</label><div class="selwrap">${I.chev}<select class="sel selnat" id="f-duracao">${dur}</select></div></div>
        <div class="field"><label>T\xE9cnico respons\xE1vel</label><div class="selwrap">${I.chev}<select class="sel selnat" id="f-tecnico">${tec}</select></div></div>
        <div class="field"><label>Valor estimado</label><div class="money-input sm"><span>R$</span><input id="f-valor" placeholder="0,00"></div></div>
      </div>
      <label class="fl">Situa\xE7\xE3o</label>
      <div class="seg"><button class="seg-btn okc on" id="f-sit-ok">${I.check} Confirmado</button><button class="seg-btn waitc" id="f-sit-wait">${I.clock} Pendente</button></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost danger" id="f-del">${I.trash} Remover</button>
      <button class="btn btn-ghost" data-close>Cancelar</button>
      <button class="btn btn-primary" id="f-salvar">${I.check} Salvar</button>
    </div>
  </div></div>

  <div class="toast" id="ag-toast">${I.check}<span>Salvo</span></div>`;
    document.body.appendChild(wrap);
    document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", fecharTudo));
    qs("#m-day").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) fecharTudo();
    });
    qs("#m-form").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) fecharTudo();
    });
    qs("#f-inicio").addEventListener("input", atualizarConflito);
    qs("#f-duracao").addEventListener("change", atualizarConflito);
    qs("#f-sit-ok").addEventListener("click", () => {
      setSituacao("confirmado");
      atualizarConflito();
    });
    qs("#f-sit-wait").addEventListener("click", () => {
      setSituacao("pendente");
      atualizarConflito();
    });
    qs("#f-salvar").addEventListener("click", () => {
      void salvar();
    });
    qs("#f-del").addEventListener("click", () => {
      if (formCtx.id) void removerServico(formCtx.id, formCtx.iso);
    });
  }
  function montarToggle() {
    const card = qs(".cal-card");
    if (!card) return;
    let escolheu = false;
    const setView = (v) => {
      card.setAttribute("data-view", v);
      card.querySelectorAll(".cv-btn").forEach((b) => b.classList.toggle("on", b.getAttribute("data-v") === v));
    };
    const auto = () => {
      if (!escolheu) setView(window.matchMedia("(min-width:960px)").matches ? "month" : "week");
    };
    card.querySelectorAll(".cv-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        escolheu = true;
        const v = btn.getAttribute("data-v");
        if (v === "week") semanaRef = new Date(partesDoIso(diaSelecionado).ano, partesDoIso(diaSelecionado).mes0, partesDoIso(diaSelecionado).dia);
        setView(v);
        renderCalendario();
      });
    });
    auto();
    window.addEventListener("resize", auto);
  }
  function montarSetas() {
    const setas = document.querySelectorAll(".agtools .icon-btn.sm");
    setas[0]?.addEventListener("click", () => navegar(-1));
    setas[1]?.addEventListener("click", () => navegar(1));
  }
  var chDias = null;
  var chSit = null;
  function apex() {
    return window.ApexCharts;
  }
  function vis(el) {
    return !!el && el.clientWidth > 4;
  }
  function ativos() {
    return todos().filter((s) => s.situacao !== "cancelado");
  }
  function somaValor(arr) {
    return arr.reduce((a, s) => a + s.valorCentavos, 0);
  }
  function milK(centavos) {
    const r = centavos / 100;
    return r >= 1e3 ? "R$ " + (r / 1e3).toFixed(1).replace(".", ",") + " mil" : formatarBRL(centavos);
  }
  function semanaDeHoje() {
    const p = partesDoIso(HOJE);
    const d = new Date(p.ano, p.mes0, p.dia);
    const dom = new Date(d);
    dom.setDate(d.getDate() - d.getDay());
    const sab = new Date(dom);
    sab.setDate(dom.getDate() + 6);
    return { ini: iso(dom.getFullYear(), dom.getMonth(), dom.getDate()), fim: iso(sab.getFullYear(), sab.getMonth(), sab.getDate()) };
  }
  var AXIS = { colors: "#6b7385", fontSize: "11px", fontWeight: 600 };
  function renderAgStats() {
    const el = qs("#ag-stats");
    if (!el) return;
    const hoje = doDia(HOJE).filter((s) => s.situacao !== "cancelado");
    const wk = semanaDeHoje();
    const semana = ativos().filter((s) => s.data >= wk.ini && s.data <= wk.fim);
    const pend = ativos().filter((s) => s.situacao === "pendente");
    el.innerHTML = `<div class="ag-stat card"><span class="si blue">${I.calday}</span><div class="ag-info"><b>${hoje.length}</b><small>Hoje</small></div><span class="ag-sub">${formatarBRL(somaValor(hoje))}</span></div><div class="ag-stat card"><span class="si acc">${I.cal}</span><div class="ag-info"><b>${semana.length}</b><small>Esta semana</small></div><span class="ag-sub">${formatarBRL(somaValor(semana))}</span></div><div class="ag-stat card"><span class="si amber">${I.clock}</span><div class="ag-info"><b>${pend.length}</b><small>Pendentes</small></div><span class="ag-sub">${formatarBRL(somaValor(pend))}</span></div>`;
  }
  function renderDash() {
    const all = ativos();
    const total = all.length;
    const conf = all.filter((s) => s.situacao === "confirmado").length;
    const pend = all.filter((s) => s.situacao === "pendente").length;
    const done = all.filter((s) => s.situacao === "concluido").length;
    const receita = somaValor(all);
    const recConf = somaValor(all.filter((s) => s.situacao === "confirmado" || s.situacao === "concluido"));
    const taxa = total > 0 ? Math.round(conf / total * 100) : 0;
    const durMedia = total > 0 ? Math.round(all.reduce((a, s) => a + s.duracaoMin, 0) / total) : 0;
    const k = qs("#ag-kpis");
    if (k) k.innerHTML = `<div class="dk card"><div class="dk-top"><span class="dk-ic blue">${I.calday}</span>Servi\xE7os</div><div class="dk-v">${total}</div><div class="dk-s">no total agendado</div></div><div class="dk card"><div class="dk-top"><span class="dk-ic green">${I.wallet}</span>Receita agendada</div><div class="dk-v">${milK(receita)}</div><div class="dk-s">${receita > 0 ? Math.round(recConf / receita * 100) : 0}% confirmada</div></div><div class="dk card"><div class="dk-top"><span class="dk-ic orange">${I.check}</span>Taxa de confirma\xE7\xE3o</div><div class="dk-v">${taxa}%</div><div class="dk-s">${conf} de ${total} servi\xE7os</div></div><div class="dk card"><div class="dk-top"><span class="dk-ic amber">${I.clock}</span>Dura\xE7\xE3o m\xE9dia</div><div class="dk-v">${formatarDuracao(durMedia)}</div><div class="dk-s">por servi\xE7o</div></div>`;
    const A = apex();
    if (!A) return;
    const dias = [0, 0, 0, 0, 0, 0, 0];
    for (const s of all) {
      const idx = (diaDaSemanaIso(s.data) + 6) % 7;
      dias[idx] = (dias[idx] ?? 0) + 1;
    }
    const dEl = qs("#ch-dias");
    const dSeries = [{ name: "Servi\xE7os", data: dias }];
    if (chDias) chDias.updateSeries(dSeries);
    else if (vis(dEl)) {
      chDias = new A(dEl, {
        chart: { type: "bar", height: 190, toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif", parentHeightOffset: 0 },
        series: dSeries,
        colors: ["#ef6300"],
        plotOptions: { bar: { columnWidth: "44%", borderRadius: 6, borderRadiusApplication: "end" } },
        dataLabels: { enabled: false },
        stroke: { width: 0 },
        fill: { type: "solid", opacity: 1 },
        grid: { show: false, padding: { left: 6, right: 6, top: 0, bottom: 0 } },
        xaxis: { categories: ["Seg", "Ter", "Qua", "Qui", "Sex", "S\xE1b", "Dom"], axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
        yaxis: { show: false },
        tooltip: { theme: "dark", y: { formatter: (v) => `${v} ${v === 1 ? "servi\xE7o" : "servi\xE7os"}` } },
        legend: { show: false }
      });
      chDias.render();
    }
    const sitDefs = [["Confirmado", conf, "#34d399"], ["Pendente", pend, "#fbbf24"], ["Conclu\xEDdo", done, "#5b8def"]];
    const sit = sitDefs.filter((x) => x[1] > 0);
    const sEl = qs("#ch-sit");
    const sOpts = {
      chart: { type: "donut", height: 200, background: "transparent", fontFamily: "Inter, sans-serif" },
      series: sit.map((x) => x[1]),
      labels: sit.map((x) => x[0]),
      colors: sit.map((x) => x[2]),
      stroke: { width: 0 },
      plotOptions: { pie: { donut: { size: "70%", labels: { show: true, name: { fontSize: "11px", color: "#98a1b3" }, value: { fontSize: "23px", fontFamily: "Sora, sans-serif", fontWeight: 800, color: "#fff" }, total: { show: true, label: "Total", fontSize: "11px", color: "#98a1b3", formatter: () => String(total) } } } } },
      dataLabels: { enabled: false },
      legend: { position: "bottom", labels: { colors: "#98a1b3" }, fontSize: "12px", fontWeight: 600, markers: { radius: 9 }, itemMargin: { horizontal: 8 } },
      tooltip: { theme: "dark", y: { formatter: (v) => `${v} servi\xE7os` } }
    };
    if (chSit) chSit.updateOptions(sOpts);
    else if (vis(sEl)) {
      chSit = new A(sEl, sOpts);
      chSit.render();
    }
    const porTec = /* @__PURE__ */ new Map();
    for (const s of all) porTec.set(s.tecnico, (porTec.get(s.tecnico) ?? 0) + s.valorCentavos);
    const tecs = [...porTec.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const max = Math.max(...tecs.map((t) => t[1]), 1);
    const cores = ["o", "b", "g", "v", "n"];
    const rt = qs("#ag-receita-tec");
    if (rt) rt.innerHTML = tecs.length ? tecs.map(([nome, v], i) => `<div class="rbar"><span class="rb-l">${nome}</span><div class="rb-track"><div class="rb-fill ${cores[i % cores.length]}" style="width:${Math.round(v / max * 100)}%"></div></div><span class="rb-v">${formatarBRL(v)}</span></div>`).join("") : `<div class="dp-sub">Sem receita agendada.</div>`;
  }
  function refreshAll() {
    renderCalendario();
    renderAgendaLateral(diaSelecionado);
    renderAgStats();
    renderDash();
  }
  async function refreshLive() {
    await carregarServicos();
    refreshAll();
  }
  async function boot() {
    montarModais();
    montarToggle();
    montarSetas();
    await Promise.all([carregarServicos(), carregarFuncionarios()]);
    renderCalendario();
    renderAgendaLateral(HOJE);
    renderAgStats();
    renderDash();
    const nb = qs("#btn-novo-ag");
    if (nb) nb.addEventListener("click", () => abrirDia(diaSelecionado));
    window.addEventListener("jc:mudou", () => {
      void refreshLive();
    });
    window.setInterval(() => {
      void refreshLive();
    }, 6e4);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else void boot();
})();

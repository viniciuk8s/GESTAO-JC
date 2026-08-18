import time
# -*- coding: utf-8 -*-
# Gerador do site estatico JC Gestao -> web/
# Le: logica-ts/dist/*.web.js e assets/*.png. CSS via sass (npm run build:css). Iconify/fontes/ApexCharts via CDN.
import re


TOPBAR = """
    <header class="topbar">
      <button class="icon-btn menu-btn" aria-label="Menu">__IC_menu__</button>
      <div class="ptitle">__PTITLE__</div>
      <div class="spacer"></div>
      <button class="icon-btn theme-btn" id="theme-btn" aria-label="Alternar tema"><iconify-icon icon="ion:moon-outline"></iconify-icon></button>
      <button class="icon-btn bell" aria-label="Notificações">__IC_bell__</button>
      <button class="pf-btn" id="pf-btn" aria-label="Perfil"><span class="pf-av"></span><i class="bi bi-person"></i></button>
      <span class="brand-top"><img class="atom" src="__ATOM__" alt="JC"></span>
    </header>"""

NAVHREF={'grid':'home.html','mov':'movimentacoes.html','agenda':'agendamentos.html',
         'rel':'relatorios.html','col':'colaboradores.html','dias':'dias-trabalhados.html','proj':'projetos.html','comp':'comparativo.html','evol':'evolucao.html'}
def SIDEBAR(active):
    items=[('grid','Início','__IC_grid__','Geral'),
           ('mov','Movimentações','__IC_wallet__','Módulos'),
           ('agenda','Agendamentos','__IC_cal__',None),
           ('rel','Relatórios','__IC_chart__',None),
           ('comp','Comparativo','__IC_trend__',None),
           ('evol','Evolução','__IC_evol__',None),
           ('col','Colaboradores','__IC_users__','Gestão'),
           ('dias','Dias trabalhados','__IC_calcheck__',None),
           ('proj','Projetos','__IC_hardhat__',None)]
    html='<aside class="sidebar"><div class="sb-head"><a href="home.html"><img class="sb-logo" src="__LOGO__" alt="JC Elétrica & Solar"></a></div><nav class="sb-nav">'
    for key,label,icon,sec in items:
        if sec: html+='<div class="nav-sec">%s</div>'%sec
        cls='nav-item active' if key==active else 'nav-item'
        badge='<span class="badge">3</span>' if key=='mov' else ''
        html+='<a class="%s" href="%s"><span class="ic">%s</span>%s%s</a>'%(cls,NAVHREF[key],icon,label,badge)
    html+='</nav></aside>'
    # barra de navegação inferior (mobile-first): 4 seções principais (o menu extra abre pelo botão do topo)
    tabs=[('grid','Início','__IC_grid__'),('mov','Financeiro','__IC_wallet__'),('agenda','Agenda','__IC_cal__'),('rel','Relatórios','__IC_chart__')]
    mt='<nav class="mtabs" aria-label="Navegação">'
    for key,label,icon in tabs:
        cls='mtab active' if key==active else 'mtab'
        mt+='<a class="%s" href="%s"><span class="mti">%s</span><span class="mtl">%s</span></a>'%(cls,NAVHREF[key],icon,label)
    mt+='</nav>'
    mt+='<script>document.addEventListener("click",function(e){var t=e.target;if(t&&t.closest&&t.closest(".drawer-overlay")){document.body.classList.remove("drawer-open")}})</script>'
    return html+mt

HOME_BODY = """
<div class="drawer-overlay"></div>
<div class="app">
  __SIDEBAR__
  <div class="main">
  __TOPBAR__
    <div class="content va">
      <div class="page-head">
        <div><h1><span class="greet-hi">Olá</span>, João Carlos</h1><p>Resumo do seu negócio</p></div>
        <div class="ph-actions"></div>
      </div>

      <div class="tile hero-tile">
        <div class="hero-info">
          <div class="hero-top"><small>Dinheiro em caixa hoje</small><div class="hero-top-r"><span class="live-badge"><i></i> ao vivo</span><button class="hero-eye" type="button" aria-label="Mostrar ou ocultar saldo"><iconify-icon icon="ion:eye-outline"></iconify-icon></button></div></div>
          <div class="hero-val" id="h-saldo">R$ —</div>
          <div class="hero-sub" id="h-saldo-sub">os números aparecem quando o sistema estiver ligado</div>
          
        </div>
        <div class="hero-chart" id="h-flow"></div>
      </div>

      <div class="qa-row">
        <a class="qa" href="movimentacoes.html"><span class="qa-ic accent"><iconify-icon icon="ion:add-outline"></iconify-icon></span><small>Registrar</small></a>
        <a class="qa" href="agendamentos.html"><span class="qa-ic"><iconify-icon icon="ion:calendar-outline"></iconify-icon></span><small>Agendar</small></a>
        <a class="qa" href="relatorios.html"><span class="qa-ic"><iconify-icon icon="ion:document-text-outline"></iconify-icon></span><small>Relatório</small></a>
        <a class="qa" href="projetos.html"><span class="qa-ic"><iconify-icon icon="ion:albums-outline"></iconify-icon></span><small>Projetos</small></a>
      </div>

      <div class="sumrow" id="h-kpis"></div>

      <div class="va-grid2">
        <div class="tile"><div class="tile-h">Situação das obras <span class="tile-meta" id="h-proj-meta"></span></div><div class="chart-box" id="h-proj"></div><div class="legend"><span class="lg"><i style="background:#fbbf24"></i>orçamento</span><span class="lg"><i style="background:#5b8def"></i>em andamento</span><span class="lg"><i style="background:#34d399"></i>concluído</span><span class="lg"><i style="background:#f87171"></i>cancelado</span></div></div>
        <div class="tile"><div class="tile-h">Dinheiro que entrou e saiu <span class="tile-meta">por dia</span></div><div class="chart-box" id="h-bars"></div><div class="legend"><span class="lg"><i style="background:#34d399"></i>entrou</span><span class="lg"><i style="background:#f87171"></i>saiu</span></div></div>
      </div>

      <div class="tile"><div class="tile-h">Serviços marcados <span class="tile-meta" id="h-ag-meta"></span></div><div id="h-ag"></div></div>

      <div class="va-grid2">
        <div class="tile"><div class="tile-h">Alertas <span class="tile-meta" id="h-updated"></span></div><div id="h-alertas"></div></div>
        <div class="tile feed-tile"><div class="tile-h">O que aconteceu por último <span class="live-badge" id="h-feed-live"><i></i> tempo real</span></div><div class="feed" id="h-feed"><div class="dp-sub">Sem atividade recente.</div></div></div>
      </div>
    </div>
  </div>
</div>
<script>(function(){var g=document.querySelector(".greet-hi");if(g){var h=new Date().getHours();g.textContent=h<12?"Bom dia":h<18?"Boa tarde":"Boa noite"}var eye=document.querySelector(".hero-eye"),hero=document.querySelector(".hero-tile"),K="jc-saldo-oculto";if(eye&&hero){try{if(localStorage.getItem(K)==="1")hero.classList.add("saldo-oculto")}catch(e){}eye.addEventListener("click",function(){hero.classList.toggle("saldo-oculto");try{localStorage.setItem(K,hero.classList.contains("saldo-oculto")?"1":"0")}catch(e){}})}})()</script>
<script>__HOMEJS__</script>
"""
HOME_BODY = HOME_BODY.replace('__SIDEBAR__',SIDEBAR('grid')).replace('__TOPBAR__',TOPBAR.replace('__PTITLE__','Início'))

def exrow(kind,cat,desc,meta,amt,saldo,st):
    sign='+ ' if kind=='in' else '− '
    cls='pos' if kind=='in' else 'neg'
    return ('<div class="exrow"><span class="excat %s st-%s">%s</span>'
            '<div class="exmain">'
            '<div class="ex-top"><b class="ex-desc">%s</b><b class="ex-amt %s">%sR$ %s</b></div>'
            '<div class="ex-bot"><small class="ex-meta">%s</small><small class="ex-saldo">saldo R$ %s</small></div>'
            '</div><span class="exchev">__IC_chevr__</span></div>'%(kind,st,cat,desc,cls,sign,amt,meta,saldo))

MOV_LIST = ('<div class="exday">Hoje · 22 jul</div>'
 + exrow('in','__IC_solar__','Instalação solar — Cond. Vila Verde','Instalação solar · Pix','12.500,00','51.050,00','pago')
 + exrow('out','__IC_forn__','Compra de cabos e disjuntores','Fornecedores · Boleto','4.200,00','38.550,00','pago')
 + exrow('in','__IC_serv__','Manutenção elétrica — Mercado São José','Serviços · Transferência','1.850,00','42.750,00','pago')
 + '<div class="exday">21 jul</div>'
 + exrow('out','__IC_folha__','Folha de pagamento — equipe','Folha · Transferência','9.800,00','40.900,00','pago')
 + exrow('in','__IC_solar__','Projeto fotovoltaico — Padaria','Instalação solar · Boleto','7.600,00','50.700,00','pendente')
 + '<div class="exday">18 jul</div>'
 + exrow('out','__IC_inst__','Aluguel do galpão','Instalações · Boleto','3.500,00','43.100,00','pago')
 + exrow('in','__IC_serv__','Vistoria de geração — Aldeota','Serviços · Pix','900,00','46.600,00','agendado'))

MOV_BODY = """
<div class="drawer-overlay"></div>
<div class="app">
  __SIDEBAR__
  <div class="main">
  __TOPBAR__
    <div class="content va">
      <div class="page-head">
        <div><h1>Movimentações</h1><p>Tudo que entra e sai do seu caixa</p></div>
        <div class="ph-actions">
          <button class="btn btn-ghost" data-open="export">__IC_download__ Exportar</button>
          <button class="btn btn-primary" data-open="novo">__IC_plus__ Nova entrada ou saída</button>
        </div>
      </div>

      <!-- HERO: saldo ao vivo + gráfico de fluxo -->
      <div class="tile hero-tile">
        <div class="hero-info">
          <div class="hero-top"><small>Resultado no período</small><span class="live-badge" id="live-badge"><i></i> ao vivo</span></div>
          <div class="hero-val" id="mov-hero-val">R$ —</div>
          <div class="hero-sub" id="mov-hero-sub">os números aparecem quando o sistema estiver ligado</div>
          
        </div>
        <div class="hero-chart" id="mov-flow"></div>
      </div>

      <!-- KPI tiles (entradas / saídas / saldo) -->
      <div class="sumrow" id="mov-sum"></div>

      <!-- Entradas x Saídas por dia -->
      <div class="tile"><div class="tile-h">Entrou e saiu, por dia <span class="tile-meta">o dia a dia do caixa</span></div><div id="mov-bars"></div></div>

      <!-- Gauge (margem, com contexto) + Donut (categorias, com legenda) -->
      <div class="va-grid2">
        <div class="tile"><div class="tile-h">Quanto sobra de lucro <span class="tile-meta">do que entra, quanto vira lucro</span></div><div class="chart-box" id="mov-gauge"></div><div class="legend"><span class="lg-note">quanto maior, mais sobra de lucro</span></div><div class="gauge-sub" id="mov-gauge-sub"></div></div>
        <div class="tile"><div class="tile-h">Onde o dinheiro foi gasto <span class="tile-meta">gastos do mês</span></div><div class="chart-box" id="mov-donut"></div><div class="legend"><span class="lg-note">cada cor é um tipo de gasto</span></div><div class="donut-leg" id="mov-donut-leg"></div></div>
      </div>

      <!-- KPIs analíticos -->
      <div class="dash-kpis" id="mov-kpis"></div>

      <!-- Entradas e saídas ao vivo (com CRUD) -->
      <div class="tile list-tile">
        <div class="tile-h">Entradas e saídas <span class="tile-meta" id="mov-updated"></span></div>
        <div class="filters">
          <div class="search">__IC_search__<input placeholder="Buscar lançamento..."></div>
          <div class="chips"><span class="chipf on" data-tipo="">Todos</span><span class="chipf" data-tipo="entrada">Entradas</span><span class="chipf" data-tipo="saida">Saídas</span></div>
        </div>
        <section id="mov-list"></section>
      </div>
    </div>
  </div>
</div>
<button class="fab" data-open="novo" aria-label="Nova entrada ou saída">__IC_plus__</button>
<div class="modal-wrap" id="m-detail"><div class="modal">
  <div class="modal-head"><h3>Detalhes do movimento</h3><button class="mclose">&times;</button></div>
  <div class="modal-body" id="det-rows"></div>
  <div class="modal-foot"><button class="btn btn-ghost danger" id="det-del">__IC_trash__ Excluir</button><button class="btn btn-primary" id="det-edit">__IC_edit__ Editar</button></div>
</div></div>

<div class="modal-wrap" id="m-novo"><div class="modal modal-lg">
  <div class="modal-head"><h3 id="mnovo-title">Nova entrada ou saída</h3><button class="mclose">&times;</button></div>
  <div class="modal-body">
    <div class="f-erros" id="mov-erro" hidden></div>
    <div class="wizard" data-wizard>
      <div class="wz-head"><div class="wz-dots"><i></i><i></i><i></i></div><div class="wz-label"><span class="wz-name">Valor</span> · <b class="wz-cur">1</b>/<span class="wz-total">3</span></div></div>
      <div class="wz-track">
        <section class="wz-step on" data-name="Valor">
          <div class="seg"><button class="seg-btn on in" data-tipo="entrada">__IC_in__ Entrada</button><button class="seg-btn out" data-tipo="saida">__IC_out__ Saída</button></div>
          <label class="fl">Valor</label>
          <div class="money-input"><span>R$</span><input id="mov-valor" inputmode="decimal" placeholder="0,00" required></div>
        </section>
        <section class="wz-step" data-name="Detalhes">
          <div class="form-grid">
            <div class="field span2"><label>Descrição</label><input class="inp" id="mov-desc" placeholder="Ex.: Instalação solar — Cond. Vila Verde" required></div>
            <div class="field"><label>Categoria</label><div class="selwrap"><select class="selnat" id="mov-cat"><option>Serviços</option><option>Fornecedores</option><option>Folha de pagamento</option><option>Instalações</option><option>Impostos</option><option>Gasolina</option><option>Almoço</option><option>Outros</option></select>__IC_chevdown__</div><input class="inp mov-outro" id="mov-cat-outro" placeholder="Digite a categoria" maxlength="40" hidden></div>
            <div class="field span2"><label>Forma de pagamento</label><div class="selwrap"><select class="selnat" id="mov-forma"><option value="pix">Pix</option><option value="transferencia">Transferência</option><option value="boleto">Boleto</option><option value="cartao">Cartão</option><option value="dinheiro">Dinheiro</option></select>__IC_chevdown__</div></div>
          </div>
        </section>
        <section class="wz-step" data-name="Quando">
          <div class="form-grid">
            <div class="field"><label>Data</label><input type="date" class="inp" id="mov-data"></div>
            <div class="field"><label>Situação</label><div class="selwrap"><select class="selnat" id="mov-situacao"><option value="pago">Pago</option><option value="pendente">Pendente</option><option value="agendado">Agendado</option></select>__IC_chevdown__</div></div>
          </div>
          <label class="check"><span class="cbox" id="mov-recorrente">__IC_check__</span> Repetir mensalmente</label>
        </section>
      </div>
    </div>
  </div>
  <div class="modal-foot wz-foot"><button class="btn btn-ghost wz-cancel" data-close>Cancelar</button><button class="btn btn-ghost wz-back" type="button">Voltar</button><button class="btn btn-primary wz-next" type="button">Próximo</button><button class="btn btn-primary wz-submit" id="mov-save">Salvar</button></div>
</div></div>

<div class="modal-wrap" id="m-export"><div class="modal">
  <div class="modal-head"><h3>Exportar movimentações</h3><button class="mclose">&times;</button></div>
  <div class="modal-body">
    <label class="fl">Formato</label>
    <div class="opt-grid">
      <button class="opt on">__IC_xls__ Excel <small>.xlsx</small></button>
      <button class="opt">__IC_csv__ CSV <small>.csv</small></button>
      <button class="opt">__IC_pdf__ PDF <small>.pdf</small></button>
    </div>
    <label class="fl">Período</label>
    <div class="sel">Julho 2026 __IC_chevdown__</div>
    <label class="fl">Incluir</label>
    <div class="chips"><span class="chipf on">Todos</span><span class="chipf">Só entradas</span><span class="chipf">Só saídas</span></div>
    <div class="exp-sum">__IC_check__ 7 lançamentos no período · saldo R$ 5.350,00</div>
  </div>
  <div class="modal-foot"><button class="btn btn-ghost">Cancelar</button><button class="btn btn-primary">__IC_download__ Exportar</button></div>
</div></div>
<div class="toast">__IC_check__<span class="tmsg">Lançamento salvo com sucesso</span></div>
<script>__MOVJS__</script>
"""
MOV_BODY = (MOV_BODY.replace('__SIDEBAR__',SIDEBAR('mov'))
  .replace('__TOPBAR__',TOPBAR.replace('__PTITLE__','Movimentações'))
  )

# ===== Agendamentos =====
def weekstrip():
    data=[('DOM',19,0,None),('SEG',20,0,None),('TER',21,0,None),('QUA',22,1,'wait'),('QUI',23,0,'wait'),('SEX',24,0,'ok'),('SAB',25,0,None)]
    out=''
    for dn,num,sel,st in data:
        cls='wday sel' if sel else 'wday'
        dot=('<span class="wdot %s"></span>'%st) if st else ''
        out+='<button class="%s" data-d="%d"><small>%s</small><b>%d</b>%s</button>'%(cls,num,dn,num,dot)
    return out

def calgrid():
    heads=['D','S','T','Q','Q','S','S']
    out=''.join('<span class="cah">%s</span>'%h for h in heads)
    dots={22:'wait',23:'wait',24:'ok',26:'ok'}
    for _ in range(3): out+='<span class="cd mut"></span>'
    for d in range(1,32):
        st=dots.get(d)
        cls='cd sel' if d==22 else ('cd has' if st else 'cd')
        dot=('<span class="cdot %s"></span>'%st) if st else ''
        out+='<span class="%s" data-d="%d">%d%s</span>'%(cls,d,d,dot)
    out+='<span class="cd mut"></span>'
    return out

def appt(time,dur,title,client,status,label,val,tec,cor):
    return ('<div class="appt"><div class="appt-time"><b>%s</b><small>%s</small></div>'
            '<span class="appt-dot %s"></span>'
            '<div class="appt-card"><div class="appt-top"><b>%s</b><div class="appt-badges"><span class="apt-b %s">%s</span></div></div>'
            '<div class="appt-sub">__IC_pin__<span>%s</span></div>'
            '<div class="appt-foot"><span class="appt-team"><span class="av %s">%s</span>%s</span><span class="appt-val">%s</span></div></div></div>'
            %(time,dur,status,title,status,label,client,cor,tec[:2].upper(),tec,val))

APPTS = (appt('09:00','2h','Instalação de painéis solares','Condomínio Vila Verde','ok','Confirmado','R$ 12.500,00','Carlos Lima','b')
 + appt('11:00','1h30','Manutenção elétrica predial','Mercado São José','wait','Pendente','R$ 1.850,00','João Pedro','d')
 + appt('14:00','1h','Vistoria de geração solar','Padaria Pão Quente','ok','Confirmado','R$ 900,00','Maria Souza','a'))

AGENDA_BODY = """
<div class="drawer-overlay"></div>
<div class="app">
  __SIDEBAR__
  <div class="main">
  __TOPBAR__
    <div class="content va">
      <div class="page-head">
        <div><h1>Agendamentos</h1><p>Serviços e visitas que você marcou</p></div>
        <div class="ph-actions">
          <button class="btn btn-primary" id="btn-novo-ag">__IC_plus__ Novo agendamento</button>
        </div>
      </div>
      <div class="ag-stats" id="ag-stats"></div>
      <div class="ag-grid">
        <section class="cal-card card" data-view="week">
          <div class="cal-head">
            <b>Julho 2026</b>
            <div class="agtools"><button class="icon-btn sm">__IC_left__</button><button class="icon-btn sm">__IC_right__</button></div>
          </div>
          <div class="calview">
            <button class="cv-btn on" data-v="week">__IC_calrange__ Semana</button>
            <button class="cv-btn" data-v="month">__IC_calday__ Mês</button>
          </div>
          <div class="weekstrip">__WEEKSTRIP__</div>
          <div class="cal">__CALGRID__</div>
          <div class="cal-legend"><span class="lg"><i class="ok"></i> Confirmado</span><span class="lg"><i class="wait"></i> Pendente</span></div>
        </section>
        <section class="agenda-card card">
          <div class="ag-dayhead"><div><b>Quarta, 22 de julho</b><small>3 serviços agendados</small></div><span class="ag-total">R$ 15.250,00</span></div>
          <div class="agenda-list">__APPTS__</div>
        </section>
      </div>

      <section class="dash">
        <div class="dash-head"><h3>Resumo dos serviços marcados</h3><span class="live-badge"><i></i> ao vivo</span></div>
        <div class="dash-kpis" id="ag-kpis"></div>
        <div class="dash-grid">
          <div class="dp card"><h4>Serviços por dia da semana</h4><div class="dp-sub">carga de trabalho da equipe</div><div id="ch-dias" class="chart"></div></div>
          <div class="dp card"><h4>Situação</h4><div class="dp-sub">confirmados x pendentes</div><div id="ch-sit" class="chart"></div></div>
          <div class="dp card span-all"><h4>Receita por técnico</h4><div class="dp-sub">estimativa agendada</div>
            <div class="rbars" id="ag-receita-tec"></div>
          </div>
        </div>
      </section>
    </div>
  </div>
</div>
<script>__AGENDAJS__</script>
"""
AGENDA_BODY = (AGENDA_BODY
  .replace('__SIDEBAR__',SIDEBAR('agenda'))
  .replace('__TOPBAR__',TOPBAR.replace('__PTITLE__','Agendamentos'))
  .replace('__WEEKSTRIP__',weekstrip())
  .replace('__CALGRID__',calgrid())
  .replace('__APPTS__',APPTS)
  )

# ===== Dias trabalhados =====
DIAS_BODY = """
<div class="drawer-overlay"></div>
<div class="app">
  __SIDEBAR__
  <div class="main">
  __TOPBAR__
    <div class="content va">
      <div class="page-head">
        <div><h1>Dias trabalhados</h1><p>Dias e horas que a equipe trabalhou</p></div>
        <div class="ph-actions">
          <button class="btn btn-ghost">Julho 2026 __IC_chevdown__</button>
          <button class="btn btn-primary">__IC_plus__ Registrar dia</button>
        </div>
      </div>
      <div class="sumrow" id="dias-sum"></div>
      <div class="va-grid2">
        <div class="tile"><div class="tile-h">Horas de cada pessoa <span class="tile-meta">no mês</span></div><div class="chart-box" id="dias-horas"></div><div class="legend"><span class="lg-note">cada barra é uma pessoa</span></div></div>
        <div class="tile"><div class="tile-h">Pagamentos <span class="tile-meta">pagos e a pagar</span></div><div class="chart-box" id="dias-gauge"></div><div class="legend"><span class="lg"><i style="background:#34d399"></i>pagos</span><span class="lg"><i style="background:#f87171"></i>a pagar</span></div><div class="gauge-sub" id="dias-gauge-sub"></div></div>
      </div>
      <div class="emps" id="dias-list" data-lt-search data-lt-ph="Buscar colaborador…"></div>
    </div>
  </div>
</div>
<button class="fab" id="dias-fab" aria-label="Registrar dia">__IC_plus__</button>
<script>__DIASJS__</script>
"""
DIAS_BODY = (DIAS_BODY
  .replace('__SIDEBAR__',SIDEBAR('dias'))
  .replace('__TOPBAR__',TOPBAR.replace('__PTITLE__','Dias trabalhados'))
  )

# ===== Colaboradores (foto via API local) =====
COLAB_BODY = """
<div class="drawer-overlay"></div>
<div class="app">
  __SIDEBAR__
  <div class="main">
  __TOPBAR__
    <div class="content va">
      <div class="page-head">
        <div><h1>Colaboradores</h1><p>As pessoas que trabalham com você</p></div>
        <div class="ph-actions"></div>
      </div>
      <div class="va-grid2">
        <div class="tile"><div class="tile-h">Pessoas por área <span class="tile-meta">setor</span></div><div class="chart-box" id="col-donut"></div><div class="legend"><span class="lg-note">cada cor é uma área da equipe</span></div><div class="donut-leg" id="col-donut-leg"></div></div>
        <div class="tile"><div class="tile-h">Foto de perfil <span class="tile-meta">com foto e sem foto</span></div><div class="chart-box" id="col-gauge"></div><div class="legend"><span class="lg"><i style="background:#34d399"></i>com foto</span><span class="lg"><i style="background:#8891a8"></i>sem foto</span></div><div class="gauge-sub" id="col-gauge-sub"></div></div>
      </div>
      <div class="colab-grid" id="colab-grid" data-lt-search data-lt-ph="Buscar colaborador…" data-lt-sorts="nome:Nome|foto:Com foto"></div>
    </div>
  </div>
</div>
<script>__COLABJS__</script>
"""
COLAB_BODY = (COLAB_BODY
  .replace('__SIDEBAR__',SIDEBAR('col'))
  .replace('__TOPBAR__',TOPBAR.replace('__PTITLE__','Colaboradores'))
  )

# ===== Relatórios & Documentos =====
REL_STYLE = ''  # migrado para scss/pages/_relatorios.scss

def docrow(ic_cls, icon, title, sub_icon, sub_ent, sub_date, badge_cls, badge_icon, badge_txt, fmt):
  return ('<div class="docrow">'
    '<span class="doc-ic %s">%s</span>'
    '<div class="doc-main"><div class="doc-top"><b>%s</b></div>'
    '<div class="doc-sub">%s<span>%s</span><i class="dot"></i><span>%s</span></div></div>'
    '<div class="doc-side"><span class="vbadge %s">%s%s</span><span class="doc-fmt">%s</span></div>'
    '<div class="doc-acts">'
    '<button class="mini-act" data-open="docview" title="Ver">__IC_eye__</button>'
    '<button class="mini-act" data-toast="Download iniciado" title="Baixar">__IC_download__</button>'
    '<button class="mini-act danger" data-toast="Documento removido" title="Excluir">__IC_trash__</button>'
    '</div></div>'%(ic_cls,icon,title,sub_icon,sub_ent,sub_date,badge_cls,badge_icon,badge_txt,fmt))

DOCROWS = "".join([
  docrow('orange','__IC_sign__','Contrato de instalação solar','__IC_inst__','Condomínio Vila Verde','emitido 02/07/2026','ok','__IC_check__',' Vigente até 07/2027','PDF · 240 KB'),
  docrow('green','__IC_receipt__','Nota fiscal NF-e 001432','__IC_serv__','Mercado São José · serviço #ag_2','11/07/2026','info','','R$ 1.850,00','PDF · 120 KB'),
  docrow('blue','__IC_shield__','Garantia — inversor Growatt 8 kW','__IC_inst__','Condomínio Vila Verde','05/07/2026','ok','__IC_check__',' Vigente até 2031','PDF · 1,2 MB'),
  docrow('violet','__IC_stamp__','Laudo técnico / ART-CREA','__IC_pin__','Padaria Pão Quente · vistoria','14/07/2026','warn','__IC_alert__',' Vence em 26 dias','PDF · 320 KB'),
  docrow('blue','__IC_landmark__','Homologação — parecer de acesso (Enel)','__IC_inst__','Condomínio Vila Verde','08/07/2026','ok','__IC_check__',' Aprovado','PDF · 90 KB'),
  docrow('amber','__IC_usercheck__','Certificação NR-35 (trabalho em altura)','__IC_users__','Colaborador · Rafael Gomes','válida até 28/08/2026','warn','__IC_alert__',' Vence em 30 dias','PDF · 200 KB'),
  docrow('slate','__IC_forn__','Nota de compra — 12 módulos 550 W','__IC_forn__','Fornecedor · SolarTech','01/07/2026','info','','R$ 9.400,00','PDF · 180 KB'),
  docrow('green','__IC_receipt__','Recibo de pagamento — jornada 22/07','__IC_users__','Colaborador · Carlos Lima','22/07/2026','ok','__IC_check__',' Pago','PDF · 60 KB'),
  docrow('slate','__IC_briefcase__','Contrato de trabalho','__IC_users__','Colaborador · João Pedro','10/01/2025','ok','__IC_check__',' Vigente','PDF · 210 KB'),
])

def exfin(kind, st, desc, meta, saldo, amt):
  cls='in' if kind=='in' else 'out'
  sign='+ ' if kind=='in' else '− '
  amtcls='pos' if kind=='in' else 'neg'
  return ('<div class="exrow"><span class="excat %s st-%s">%s</span>'
    '<div class="exmain"><div class="ex-top"><div class="ex-desc">%s</div>'
    '<div class="ex-amt %s">%s%s</div></div>'
    '<div class="ex-bot"><div class="ex-meta">%s</div><div class="ex-saldo">%s</div></div></div>'
    '<span class="exchev">__IC_chevr__</span></div>'
    %(cls,st,('__IC_in__' if kind=='in' else '__IC_out__'),desc,amtcls,sign,amt,meta,saldo))

FINROWS = ('<div class="exday">22 de julho</div>'
  + exfin('in','pago','Recebido — Condomínio Vila Verde','Instalação solar · parcela 1/2 · Pix','Pago','R$ 6.250,00')
  + exfin('out','pendente','Pago à equipe — Carlos Lima','Dia trabalhado 22/07 · a pagar','Pendente','R$ 240,00')
  + '<div class="exday">20 de julho</div>'
  + exfin('in','pago','Recebido — Mercado São José','NF-e 001432 · manutenção · transferência','Pago','R$ 1.850,00')
  + '<div class="exday">18 de julho</div>'
  + exfin('out','pago','Pago fornecedor — SolarTech','12 módulos 550 W · boleto','Pago','R$ 9.400,00')
  + '<div class="exday">15 de julho</div>'
  + exfin('in','pago','Recebido — Residência Aldeota','Troca de quadro · cartão','Pago','R$ 2.400,00')
  + exfin('out','agendado','Pagamento de folha (parcial)','Salários julho · agendado','Agendado','R$ 12.800,00'))

REL_BODY = """
<div class="drawer-overlay"></div>
<div class="app">
  __SIDEBAR__
  <div class="main">
  __TOPBAR__
    <div class="content va">
      <div class="page-head">
        <div><h1>Relatórios &amp; Documentos</h1><p>Contratos, notas e comprovantes guardados</p></div>
        <div class="ph-actions">
          <button class="btn btn-ghost" data-open="import">__IC_upload__ Importar</button>
          <button class="btn btn-ghost" data-open="export">__IC_download__ Exportar</button>
          <button class="btn btn-primary" data-open="doc">__IC_plus__ Novo documento</button>
        </div>
      </div>

      <div class="rtabs">
        <button class="rtab on" data-tab="docs">__IC_folder__ Documentos <span class="tcount">42</span></button>
        <button class="rtab" data-tab="fiscal">__IC_landmark__ Fiscal</button>
        <button class="rtab" data-tab="fin">__IC_wallet__ Financeiro</button>
        <button class="rtab" data-tab="xls">__IC_db__ Planilhas</button>
      </div>

      <!-- ============ DOCUMENTOS ============ -->
      <div class="rpane" data-pane="docs">
        <div class="alert-banner" id="doc-alert" hidden></div>
        <div class="filters">
          <div class="search">__IC_search__<input placeholder="Buscar documento, cliente, nº da NF..."></div>
          <button class="btn btn-primary" data-open="doc">__IC_plus__ Novo</button>
        </div>
        <div class="chips">
          <span class="chipf on" data-tipo="">Todos</span><span class="chipf" data-tipo="contrato">Contratos</span><span class="chipf" data-tipo="nota_fiscal">Notas fiscais</span>
          <span class="chipf" data-tipo="garantia">Garantias</span><span class="chipf" data-tipo="laudo">Laudos / ART</span><span class="chipf" data-tipo="homologacao">Homologação</span>
          <span class="chipf" data-tipo="recibo">Recibos</span><span class="chipf" data-tipo="rh">RH</span>
        </div>
        <section class="card docwrap" id="doc-list"></section>
      </div>

      <!-- ============ FISCAL (NOTAS & IMPOSTOS) ============ -->
      <div class="rpane" data-pane="fiscal" hidden>
        <div class="tile hero-tile">
          <div class="hero-info">
            <div class="hero-top"><small>Impostos para pagar no mês</small><span class="live-badge"><i></i> ao vivo</span></div>
            <div class="hero-val" id="fis-hero-val">R$ —</div>
            <div class="hero-sub" id="fis-hero-sub">os números aparecem quando o sistema estiver ligado</div>
            
          </div>
          <div class="hero-chart" id="fis-hero-chart"></div>
        </div>
        <div class="sumrow" id="fiscal-sum"></div>
        <div class="va-grid2">
          <div class="tile"><div class="tile-h">Impostos por tipo <span class="tile-meta">por situação</span></div><div class="chart-box" id="fis-bars"></div><div class="legend"><span class="lg-note">cada barra é um tipo de imposto</span></div></div>
          <div class="tile"><div class="tile-h">Tipos de imposto <span class="tile-meta">a pagar</span></div><div class="chart-box" id="fis-donut"></div><div class="legend"><span class="lg-note">cada cor é um tipo de imposto</span></div><div class="donut-leg" id="fis-donut-leg"></div></div>
        </div>
        <section class="card" style="padding:8px 14px 14px">
          <div class="pane-head" style="padding:12px 2px 6px"><div><h3>Impostos a pagar</h3><p>Guias do período · toque para marcar como paga</p></div><span class="meta">Simples Nacional</span></div>
          <div id="fiscal-obrig"></div>
        </section>
        <section class="card" style="padding:8px 14px 14px">
          <div class="pane-head" style="padding:12px 2px 6px"><div><h3>Notas fiscais que você emitiu</h3><p>NF-e registradas nos documentos</p></div><button class="btn btn-ghost" data-open="export">__IC_download__ Exportar</button></div>
          <div id="fiscal-nf"></div>
        </section>
      </div>

      <!-- ============ FINANCEIRO ============ -->
      <div class="rpane" data-pane="fin" hidden>
        <div class="tile hero-tile">
          <div class="hero-info">
            <div class="hero-top"><small>Resultado do mês (sobrou ou faltou)</small><span class="live-badge"><i></i> ao vivo</span></div>
            <div class="hero-val" id="fin-hero-val">R$ —</div>
            <div class="hero-sub" id="fin-hero-sub">os números aparecem quando o sistema estiver ligado</div>
            
          </div>
          <div class="hero-chart" id="fin-flow"></div>
        </div>
        <div class="sumrow" id="fin-sum"></div>
        <div class="va-grid2">
          <div class="tile"><div class="tile-h">Dinheiro que entrou e saiu <span class="tile-meta">por dia</span></div><div class="chart-box" id="fin-bars"></div><div class="legend"><span class="lg"><i style="background:#34d399"></i>entrou</span><span class="lg"><i style="background:#f87171"></i>saiu</span></div></div>
          <div class="tile"><div class="tile-h">Já recebido e a receber <span class="tile-meta">caixa</span></div><div class="chart-box" id="fin-donut"></div><div class="legend"><span class="lg"><i style="background:#34d399"></i>já recebido</span><span class="lg"><i style="background:#f87171"></i>a receber</span></div><div class="donut-leg" id="fin-donut-leg"></div></div>
        </div>
        <section class="panel card">
          <div class="ph"><h3>O que você ainda tem a receber</h3><span class="meta" id="fin-receber-meta"></span></div>
          <div id="fin-receber" style="margin-top:2px"></div>
        </section>
        <section class="card" style="padding:8px 14px 14px">
          <div class="pane-head" style="padding:12px 2px 6px"><div><h3>Lista de pagamentos</h3><p>Recebimentos e pagamentos do mês</p></div><button class="btn btn-ghost" data-open="export">__IC_download__ Exportar</button></div>
          <div id="fin-extrato"></div>
        </section>
      </div>

      <!-- ============ PLANILHAS ============ -->
      <div class="rpane" data-pane="xls" hidden>
        <div class="rel-grid">
          <section class="card" style="padding:18px">
            <div class="card-title">__IC_upload__ Importar dados</div>
            <p class="card-desc">Traga lançamentos, agendamentos ou colaboradores de uma planilha. As colunas são mapeadas automaticamente para os campos do sistema.</p>
            <div class="dz" data-open="import"><span class="dz-ic">__IC_upload__</span><b>Arraste uma planilha ou clique para selecionar</b><small>CSV, XLSX ou XLS · até 5 MB</small></div>
            <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;align-items:center"><button class="btn btn-ghost btn-sm" id="baixar-modelo">__IC_download__ Baixar modelo (.csv)</button><span class="doc-fmt">colunas: data, descrição, categoria, tipo, forma, valor, situação</span></div>
          </section>
          <section class="card" style="padding:18px">
            <div class="card-title">__IC_download__ Exportar &amp; relatórios</div>
            <p class="card-desc">Gere relatórios em Excel ou CSV — inclusive o pacote do contador (NF + extrato + DRE), num arquivo com abas.</p>
            <label class="fl" style="margin-top:0">Formato</label>
            <div class="opt-grid" style="grid-template-columns:repeat(2,1fr)"><button class="opt on" data-fmt="xlsx">__IC_xls__ Excel <small>.xlsx</small></button><button class="opt" data-fmt="csv">__IC_csv__ CSV <small>.csv</small></button></div>
            <label class="fl">O que exportar</label>
            <div class="chips"><span class="chipf on" data-tipo="movimentacoes">Movimentações</span><span class="chipf" data-tipo="agendamentos">Agendamentos</span><span class="chipf" data-tipo="jornadas">Dias trabalhados</span><span class="chipf" data-tipo="documentos">Documentos</span><span class="chipf" data-tipo="contador">Pacote do contador</span></div>
            <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:16px" id="exportar-planilhas">__IC_download__ Exportar</button>
          </section>
        </div>
        <section class="card" style="padding:8px 14px 14px">
          <div class="pane-head" style="padding:12px 2px 8px"><div><h3>Arquivos que você trouxe ou baixou</h3></div></div>
          <div class="hrow"><span class="h-ic">__IC_csv__</span><div class="h-main"><b>extrato-bancario-julho.csv</b><small>Importado · 34 lançamentos reconhecidos</small></div><span class="h-tag imp">Importado</span><span class="doc-fmt">20/07 14:32</span></div>
          <div class="hrow"><span class="h-ic">__IC_xls__</span><div class="h-main"><b>relatorio-mensal-junho.xlsx</b><small>Movimentações + dias trabalhados</small></div><span class="h-tag exp">Exportado</span><span class="doc-fmt">01/07 09:10</span></div>
          <div class="hrow"><span class="h-ic">__IC_pdf__</span><div class="h-main"><b>pacote-contador-2T2026.pdf</b><small>NF + extrato + DRE do trimestre</small></div><span class="h-tag exp">Exportado</span><span class="doc-fmt">30/06 18:20</span></div>
          <div class="hrow"><span class="h-ic">__IC_csv__</span><div class="h-main"><b>agendamentos-julho.csv</b><small>Importado · 12 serviços</small></div><span class="h-tag imp">Importado</span><span class="doc-fmt">28/06 11:05</span></div>
        </section>
      </div>

    </div>
  </div>
</div>

<button class="fab" data-open="doc" aria-label="Novo documento">__IC_plus__</button>
<!-- ===== Modal: Anexar documento ===== -->
<div class="modal-wrap" id="m-doc"><div class="modal modal-lg">
  <div class="modal-head"><h3>Anexar documento</h3><button class="mclose">&times;</button></div>
  <div class="modal-body">
    <div class="f-erros" id="doc-erro" hidden></div>
    <div class="wizard" data-wizard>
      <div class="wz-head"><div class="wz-dots"><i></i><i></i><i></i></div><div class="wz-label"><span class="wz-name">Arquivo</span> · <b class="wz-cur">1</b>/<span class="wz-total">3</span></div></div>
      <div class="wz-track">
        <section class="wz-step on" data-name="Arquivo">
          <label class="dz sm" for="doc-file" style="cursor:pointer"><span class="dz-ic">__IC_upload__</span><b id="doc-file-nome">Selecionar arquivo</b><small>PDF, imagem, DOCX ou XLSX · até 10 MB</small></label>
          <input type="file" id="doc-file" hidden>
        </section>
        <section class="wz-step" data-name="Dados">
          <div class="form-grid">
            <div class="field span2"><label>Título do documento</label><input class="inp" id="doc-titulo" placeholder="Ex.: Contrato de instalação solar" required></div>
            <div class="field"><label>Tipo de documento</label><div class="selwrap"><select class="selnat" id="doc-tipo"><option value="contrato">Contrato</option><option value="nota_fiscal">Nota fiscal</option><option value="garantia">Garantia</option><option value="laudo">Laudo / ART</option><option value="homologacao">Homologação</option><option value="recibo">Recibo</option><option value="compra">Nota de compra</option><option value="rh">Documento (RH)</option></select>__IC_chevdown__</div></div>
            <div class="field"><label>Vincular a</label><div class="selwrap"><select class="selnat" id="doc-vinculo"><option value="cliente">Cliente / obra</option><option value="servico">Serviço da agenda</option><option value="colaborador">Colaborador</option><option value="fornecedor">Fornecedor</option><option value="geral">Nenhum (geral)</option></select>__IC_chevdown__</div></div>
            <div class="field span2"><label>Registro vinculado (rótulo)</label><input class="inp" id="doc-registro" placeholder="Ex.: Condomínio Vila Verde"></div>
          </div>
        </section>
        <section class="wz-step" data-name="Detalhes">
          <div class="form-grid">
            <div class="field"><label>Data de emissão</label><input type="date" class="inp" id="doc-emissao"></div>
            <div class="field"><label>Validade / vencimento</label><input type="date" class="inp" id="doc-vencimento"></div>
            <div class="field span2"><label>Valor (opcional)</label><div class="money-input sm"><span>R$</span><input inputmode="decimal" placeholder="0,00" id="doc-valor"></div></div>
            <div class="field span2"><label>Observações</label><textarea class="inp ta" id="doc-obs" placeholder="Ex.: contrato assinado pelas duas partes, 2 vias."></textarea></div>
          </div>
        </section>
      </div>
    </div>
  </div>
  <div class="modal-foot wz-foot"><button class="btn btn-ghost wz-cancel" data-close>Cancelar</button><button class="btn btn-ghost wz-back" type="button">Voltar</button><button class="btn btn-primary wz-next" type="button">Próximo</button><button class="btn btn-primary wz-submit" id="doc-save">__IC_check__ Salvar documento</button></div>
</div></div>

<!-- ===== Modal: Ver documento ===== -->
<div class="modal-wrap" id="m-docview"><div class="modal modal-lg">
  <div class="modal-head"><h3 id="dv-title">Documento</h3><button class="mclose">&times;</button></div>
  <div class="modal-body">
    <div class="preview-doc" id="dv-prev"></div>
    <div id="dv-rows"></div>
  </div>
  <div class="modal-foot"><button class="btn btn-ghost danger" id="dv-del">__IC_trash__ Excluir</button><a class="btn btn-primary" id="dv-download" target="_blank" rel="noopener">__IC_download__ Baixar</a></div>
</div></div>

<!-- ===== Modal: Importar planilha ===== -->
<div class="modal-wrap" id="m-import"><div class="modal modal-lg">
  <div class="modal-head"><h3>Trazer dados de uma planilha</h3><button class="mclose">&times;</button></div>
  <div class="modal-body">
    <label class="dz sm" for="imp-file" style="cursor:pointer"><span class="dz-ic">__IC_upload__</span><b id="imp-file-nome">Selecionar CSV ou XLSX</b><small>colunas: data, descrição, categoria, tipo, forma, valor, situação</small></label>
    <input type="file" id="imp-file" accept=".csv,.xlsx,.xls" hidden>
    <div class="f-erros" id="imp-erro" hidden></div>
    <div id="imp-preview"></div>
  </div>
  <div class="modal-foot"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="imp-go" disabled>__IC_check__ Importar</button></div>
</div></div>

<!-- ===== Modal: Exportar ===== -->
<div class="modal-wrap" id="m-export"><div class="modal">
  <div class="modal-head"><h3>Exportar relatório</h3><button class="mclose">&times;</button></div>
  <div class="modal-body">
    <label class="fl" style="margin-top:0">Formato</label>
    <div class="opt-grid" style="grid-template-columns:repeat(2,1fr)"><button class="opt on" data-fmt="xlsx">__IC_xls__ Excel <small>.xlsx</small></button><button class="opt" data-fmt="csv">__IC_csv__ CSV <small>.csv</small></button></div>
    <label class="fl">Conteúdo</label>
    <div class="chips"><span class="chipf on" data-tipo="movimentacoes">Movimentações</span><span class="chipf" data-tipo="agendamentos">Agendamentos</span><span class="chipf" data-tipo="jornadas">Dias trabalhados</span><span class="chipf" data-tipo="documentos">Documentos</span><span class="chipf" data-tipo="contador">Pacote do contador</span></div>
  </div>
  <div class="modal-foot"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="exportar-modal">__IC_download__ Exportar</button></div>
</div></div>

<div class="toast">__IC_check__<span class="tmsg">Salvo com sucesso</span></div>

<script>__RELJS__</script>
"""
REL_BODY = (REL_BODY
  .replace('__SIDEBAR__',SIDEBAR('rel'))
  .replace('__TOPBAR__',TOPBAR.replace('__PTITLE__','Relatórios'))
  .replace('__FINROWS__',FINROWS)
  )

# ===== Projetos (obras — visão 360°) =====
PROJ_BODY = """
<div class="drawer-overlay"></div>
<div class="app">
  __SIDEBAR__
  <div class="main">
  __TOPBAR__
    <div class="content va">
      <div class="page-head">
        <div><h1>Projetos &amp; Obras</h1><p>Cada obra com sua situação, andamento e valores</p></div>
        <div class="ph-actions">
          <button class="btn btn-primary" data-open="projnovo">__IC_plus__ Novo projeto</button>
        </div>
      </div>


      <div class="sumrow" id="proj-sum"></div>

      <div class="va-grid2">
        <div class="tile"><div class="tile-h">Situação de cada obra <span class="tile-meta" id="proj-st-meta"></span></div><div class="chart-box" id="proj-status"></div><div class="legend"><span class="lg"><i style="background:#fbbf24"></i>orçamento</span><span class="lg"><i style="background:#5b8def"></i>em andamento</span><span class="lg"><i style="background:#34d399"></i>concluído</span><span class="lg"><i style="background:#f87171"></i>cancelado</span></div></div>
        <div class="tile"><div class="tile-h">Já recebido e a receber <span class="tile-meta">por obra</span></div><div class="chart-box" id="proj-fin-chart"></div><div class="legend"><span class="lg"><i style="background:#34d399"></i>já recebido</span><span class="lg"><i style="background:#f87171"></i>a receber</span></div></div>
      </div>

      <div class="chips" style="margin-top:2px">
        <button class="chipf on" data-status="">Todos</button>
        <button class="chipf" data-status="orcamento">Orçamento</button>
        <button class="chipf" data-status="em_andamento">Em andamento</button>
        <button class="chipf" data-status="concluido">Concluído</button>
        <button class="chipf" data-status="cancelado">Cancelado</button>
      </div>

      <div class="proj-grid" id="proj-list" data-lt-search data-lt-ph="Buscar obra, cliente…" data-lt-sorts="nome:Nome|valor:Valor|prog:Progresso"></div>
    </div>
  </div>
</div>

<button class="fab" data-open="projnovo" aria-label="Novo projeto">__IC_plus__</button>
<!-- ===== Modal: detalhe 360° ===== -->
<div class="modal-wrap" id="m-proj-det"><div class="modal modal-lg">
  <div class="modal-head"><h3 id="projd-title">Projeto</h3><button class="mclose">&times;</button></div>
  <div class="modal-body">
    <div class="projd-head" id="projd-head"></div>
    <div class="proj-prog" id="projd-prog" style="margin:16px 0 6px"></div>
    <div class="projd-fin" id="projd-fin"></div>
    <div class="card-title" style="margin-top:20px">__IC_cal__ Serviços</div><div id="projd-ags"></div>
    <div class="card-title" style="margin-top:18px">__IC_file__ Documentos</div><div id="projd-docs"></div>
    <div class="card-title" style="margin-top:18px">__IC_wallet__ Movimentações</div><div id="projd-movs"></div>
  </div>
  <div class="modal-foot">
    <button class="btn btn-ghost danger" id="projd-del">__IC_trash__ Excluir</button>
    <button class="btn btn-primary" id="projd-edit">__IC_edit__ Editar</button>
  </div>
</div></div>

<!-- ===== Modal: novo / editar ===== -->
<div class="modal-wrap" id="m-proj-novo"><div class="modal modal-lg">
  <div class="modal-head"><h3 id="pnovo-title">Novo projeto</h3><button class="mclose">&times;</button></div>
  <div class="modal-body">
    <div class="f-erros" id="proj-erro" hidden></div>
    <div class="wizard" data-wizard>
      <div class="wz-head"><div class="wz-dots"><i></i><i></i><i></i></div><div class="wz-label"><span class="wz-name">Projeto</span> · <b class="wz-cur">1</b>/<span class="wz-total">3</span></div></div>
      <div class="wz-track">
        <section class="wz-step on" data-name="Projeto">
          <div class="form-grid">
            <div class="field span2"><label>Nome do projeto</label><input class="inp" id="proj-nome" placeholder="Ex.: Instalação solar — Cond. Vila Verde" required></div>
            <div class="field"><label>Cliente / obra</label><input class="inp" id="proj-cliente" placeholder="Ex.: Condomínio Vila Verde"></div>
            <div class="field"><label>Responsável</label><input class="inp" id="proj-resp" placeholder="Técnico responsável"></div>
          </div>
        </section>
        <section class="wz-step" data-name="Classificação">
          <div class="form-grid">
            <div class="field"><label>Tipo</label><div class="selwrap"><select class="selnat" id="proj-tipo"><option value="instalacao_solar">Instalação solar</option><option value="projeto_fotovoltaico">Projeto fotovoltaico</option><option value="manutencao">Manutenção</option><option value="eletrica_predial">Elétrica predial</option><option value="vistoria">Vistoria</option><option value="outro">Outro</option></select>__IC_chevdown__</div></div>
            <div class="field"><label>Status</label><div class="selwrap"><select class="selnat" id="proj-status"><option value="orcamento">Orçamento</option><option value="em_andamento">Em andamento</option><option value="concluido">Concluído</option><option value="cancelado">Cancelado</option></select>__IC_chevdown__</div></div>
            <div class="field span2"><label>Endereço (opcional)</label><input class="inp" id="proj-endereco" placeholder="Rua, nº — cidade/UF"></div>
          </div>
        </section>
        <section class="wz-step" data-name="Valores e prazo">
          <div class="form-grid">
            <div class="field"><label>Valor contratado</label><div class="money-input sm"><span>R$</span><input inputmode="decimal" placeholder="0,00" id="proj-valor"></div></div>
            <div class="field"><label>Progresso (%)</label><input class="inp" type="number" min="0" max="100" id="proj-progresso" value="0"></div>
            <div class="field"><label>Início</label><input type="date" class="inp" id="proj-inicio"></div>
            <div class="field"><label>Previsão de término</label><input type="date" class="inp" id="proj-previsao"></div>
            <div class="field span2"><label>Observações</label><textarea class="inp ta" id="proj-obs" placeholder="Notas da obra, escopo, pendências..."></textarea></div>
          </div>
        </section>
      </div>
    </div>
  </div>
  <div class="modal-foot wz-foot"><button class="btn btn-ghost wz-cancel" data-close>Cancelar</button><button class="btn btn-ghost wz-back" type="button">Voltar</button><button class="btn btn-primary wz-next" type="button">Próximo</button><button class="btn btn-primary wz-submit" id="proj-save">__IC_check__ Salvar projeto</button></div>
</div></div>
<script>__PROJJS__</script>
"""
PROJ_BODY = (PROJ_BODY
  .replace('__SIDEBAR__',SIDEBAR('proj'))
  .replace('__TOPBAR__',TOPBAR.replace('__PTITLE__','Projetos')))

# ===== CSS de autenticação (injetado no <head> de todas as páginas) =====
AUTH_CSS = """<style>
/* avatar do usuário com foto (cartão do menu) + botão sair */
.user-card .avatar.foto{ padding:0; overflow:hidden; }
.user-card .avatar.foto img{ width:100%; height:100%; object-fit:cover; border-radius:inherit; display:block; }
.user-card .uicon{ cursor:pointer; }
/* ===== tela de login ===== */
.auth-wrap{ position:relative; overflow:hidden; min-height:100vh; min-height:100dvh; display:grid; place-items:center; padding:24px;
  background:radial-gradient(1100px 520px at 50% -14%, rgba(192, 68, 42,.12), transparent 60%), var(--bg,#0c0e13); }
.auth-wave{ position:absolute; left:50%; bottom:-4%; transform:translateX(-50%); width:min(1100px,150%); max-width:none; opacity:.55; pointer-events:none; z-index:0; }
.auth-card{ position:relative; z-index:1; width:100%; max-width:404px; background:var(--card,#151821); border:1px solid var(--line,#232838);
  border-radius:20px; padding:30px 26px; box-shadow:none; }
.auth-logo{ display:flex; justify-content:center; margin-bottom:14px; }
.auth-logo img{ height:46px; }
.auth-card h1{ font-family:var(--font-head,'Inter',sans-serif); font-size:22px; text-align:center; margin:2px 0 4px; color:var(--txt,#fff); }
.auth-card .sub{ text-align:center; color:var(--mut,#98a1b3); font-size:13.5px; margin:0 0 20px; }
.auth-field{ margin-bottom:14px; }
.auth-field label{ display:block; font-size:12.5px; color:var(--mut,#98a1b3); margin-bottom:6px; font-weight:600; }
.auth-field input, .auth-field textarea{ width:100%; box-sizing:border-box; background:var(--bg,#0c0e13);
  border:1px solid var(--line,#232838); border-radius:12px; padding:12px 14px; color:var(--txt,#fff); font-size:15px; font-family:inherit; }
.auth-field input:focus, .auth-field textarea:focus{ outline:none; border-color:var(--accent,#ef6300); }
.auth-btn{ width:100%; justify-content:center; margin-top:6px; font-size:15px; padding:13px; }
.auth-alt{ text-align:center; margin-top:16px; font-size:13.5px; color:var(--mut,#98a1b3); }
.auth-alt a{ color:var(--accent-2,#ff8a3d); font-weight:600; cursor:pointer; text-decoration:none; }
.auth-erro{ background:rgba(248,113,113,.12); border:1px solid rgba(248,113,113,.4); color:#fca5a5;
  border-radius:10px; padding:10px 12px; font-size:13px; margin-bottom:14px; }
.auth-ok{ text-align:center; padding:12px 4px; }
.auth-ok .okic{ font-size:46px; color:#34d399; }
.auth-ok h2{ font-family:var(--font-head,'Inter',sans-serif); font-size:19px; margin:10px 0 6px; color:var(--txt,#fff); }
.auth-ok p{ color:var(--mut,#98a1b3); font-size:14px; margin:0 0 16px; line-height:1.5; }
.auth-btn{ border-radius:14px; }
.auth-card[hidden]{ display:none !important; }
/* mostrar/ocultar senha */
.pw-wrap{ position:relative; }
.pw-wrap input{ padding-right:48px; }
.pw-eye{ position:absolute; right:6px; top:50%; transform:translateY(-50%); width:36px; height:36px; display:grid; place-items:center;
  background:none; border:0; color:var(--mut,#98a1b3); cursor:pointer; border-radius:10px; font-size:20px; }
.pw-eye:active{ background:rgba(255,255,255,.06); }
.auth-hint{ text-align:center; color:var(--dim,#6e7896); font-size:12px; margin-top:20px; }
/* ---- mobile: login em tela cheia, com cara de app ---- */
@media (max-width:640px){
  .auth-wrap{ padding:0; place-items:stretch; }
  .auth-card{ max-width:none; min-height:100dvh; border:0; border-radius:0; box-shadow:none; background:transparent;
    display:flex; flex-direction:column; justify-content:center;
    padding:26px 22px calc(30px + env(safe-area-inset-bottom,0)); padding-top:calc(46px + env(safe-area-inset-top,0)); }
  .auth-logo{ margin-bottom:22px; }
  .auth-logo img{ height:56px; }
  .auth-card h1{ font-size:27px; }
  .auth-card .sub{ font-size:14px; margin-bottom:26px; }
  .auth-field{ margin-bottom:16px; }
  .auth-field label{ font-size:13px; }
  .auth-field input{ font-size:16px; padding:15px 16px; border-radius:14px; min-height:54px; }
  .pw-wrap input{ padding-right:52px; }
  .auth-btn{ padding:16px; font-size:16px; min-height:56px; margin-top:10px; }
  .auth-wave{ opacity:.4; bottom:-2%; }
}
</style>"""

# ===== Tela de login (sem menu; não recebe a guarda de auth) =====
LOGIN_BODY = """
<div class="auth-wrap">
  <button class="theme-btn auth-theme" id="theme-btn" aria-label="Alternar tema"><iconify-icon icon="ion:moon-outline"></iconify-icon></button>
  <img class="auth-wave" src="__WAVE__" alt="">
  <div class="auth-card" id="card-login">
    <div class="auth-logo"><img src="__LOGO__" alt="JC Elétrica & Solar"></div>
    <h1>Bem-vindo</h1>
    <p class="sub">Acesse a gestão do seu negócio</p>
    <div class="auth-erro" id="lg-erro" hidden></div>
    <div class="auth-field"><label>E-mail</label><input id="lg-email" type="email" inputmode="email" autocomplete="username" placeholder="voce@empresa.com"></div>
    <div class="auth-field"><label>Senha</label><div class="pw-wrap"><input id="lg-senha" type="password" autocomplete="current-password" placeholder="Sua senha"><button type="button" class="pw-eye" id="lg-eye" aria-label="Mostrar senha"><iconify-icon icon="ion:eye-outline"></iconify-icon></button></div></div>
    <button class="btn btn-primary auth-btn" id="lg-entrar">__IC_log-in__ Entrar</button>
    <p class="auth-alt">Não tem conta? <a id="ir-criar">Criar conta</a></p>
    <p class="auth-hint">JC Elétrica &amp; Solar</p>
  </div>

  <div class="auth-card" id="card-signup" hidden>
    <div class="auth-logo"><img src="__LOGO__" alt="JC Elétrica & Solar"></div>
    <h1>Criar conta</h1>
    <p class="sub">O acesso é liberado pelo TI após a sua solicitação</p>
    <div class="auth-erro" id="sg-erro" hidden></div>
    <div class="auth-field"><label>Nome completo</label><input id="sg-nome" type="text" autocomplete="name" placeholder="Ex.: João Carlos"></div>
    <div class="auth-field"><label>E-mail</label><input id="sg-email" type="email" inputmode="email" autocomplete="email" placeholder="voce@empresa.com"></div>
    <div class="auth-field"><label>Senha</label><div class="pw-wrap"><input id="sg-senha" type="password" autocomplete="new-password" placeholder="Mínimo de 6 caracteres"><button type="button" class="pw-eye" id="sg-eye" aria-label="Mostrar senha"><iconify-icon icon="ion:eye-outline"></iconify-icon></button></div></div>
    <button class="btn btn-primary auth-btn" id="sg-enviar">__IC_userplus__ Criar conta</button>
    <p class="auth-alt">Já tem conta? <a id="ir-login">Entrar</a></p>
  </div>

  <div class="auth-card" id="card-ok" hidden>
    <div class="auth-ok">
      <div class="okic"><iconify-icon icon="ion:time-outline"></iconify-icon></div>
      <h2>Solicitação enviada!</h2>
      <p>Sua conta foi solicitada. Assim que o <b>TI</b> liberar o acesso, você já poderá entrar com o seu e-mail e senha.</p>
      <button class="btn btn-primary auth-btn" id="ok-voltar">Voltar ao login</button>
    </div>
  </div>
</div>
<script>(function(){
  var API=(window.JC_API)||'http://localhost:3000';
  var L=document.getElementById('card-login'),S=document.getElementById('card-signup'),O=document.getElementById('card-ok');
  function mostra(el){[L,S,O].forEach(function(c){if(c)c.hidden=(c!==el)});try{window.scrollTo(0,0)}catch(e){}}
  function bindEye(be,bs){if(be&&bs)be.addEventListener('click',function(){var v=bs.type==='password';bs.type=v?'text':'password';be.innerHTML=v?'<iconify-icon icon="ion:eye-off-outline"></iconify-icon>':'<iconify-icon icon="ion:eye-outline"></iconify-icon>';bs.focus()})}
  bindEye(document.getElementById('lg-eye'),document.getElementById('lg-senha'));
  bindEye(document.getElementById('sg-eye'),document.getElementById('sg-senha'));
  var a1=document.getElementById('ir-criar');if(a1)a1.addEventListener('click',function(){mostra(S)});
  var a2=document.getElementById('ir-login');if(a2)a2.addEventListener('click',function(){mostra(L)});
  var a3=document.getElementById('ok-voltar');if(a3)a3.addEventListener('click',function(){mostra(L)});
  var btn=document.getElementById('sg-enviar');
  function erro(m){var e=document.getElementById('sg-erro');e.textContent=m;e.hidden=false}
  if(btn)btn.addEventListener('click',async function(){
    var nome=(document.getElementById('sg-nome').value||'').trim();
    var email=(document.getElementById('sg-email').value||'').trim();
    var senha=document.getElementById('sg-senha').value||'';
    document.getElementById('sg-erro').hidden=true;
    if(nome.length<2)return erro('Informe seu nome completo.');
    if(email.indexOf('@')<1||email.indexOf('.',email.indexOf('@'))<0)return erro('E-mail inválido.');
    if(senha.length<6)return erro('A senha deve ter ao menos 6 caracteres.');
    btn.disabled=true;var t=btn.textContent;btn.textContent='Enviando...';
    try{var r=await fetch(API+'/auth/registrar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:nome,email:email,senha:senha})});var d=await r.json().catch(function(){return{}});if(r.ok){mostra(O)}else{erro((d&&d.erro)||'Não foi possível enviar. Tente novamente.')}}catch(e){erro('Sem conexão. Verifique se o sistema (API) está ligado.')}
    btn.disabled=false;btn.textContent=t;
  });
})()</script>
<script>__LOGINJS__</script>
"""

ICONS={'__IC_grid__':'grid-outline','__IC_swap__':'swap-horizontal-outline','__IC_cal__':'calendar-outline',
 '__IC_chart__':'bar-chart-outline','__IC_users__':'people-outline','__IC_zap__':'flash-outline','__IC_menu__':'menu-outline',
 '__IC_bell__':'notifications-outline','__IC_chevdown__':'chevron-down-outline','__IC_trend__':'trending-up-outline','__IC_evol__':'analytics-outline','__IC_camera__':'camera-outline',
 '__IC_calday__':'calendar-outline','__IC_wallet__':'wallet-outline','__IC_bank__':'cash-outline',
 '__IC_logout__':'log-out-outline','__IC_plus__':'add-outline','__IC_search__':'search-outline',
 '__IC_in__':'arrow-down-outline','__IC_out__':'arrow-up-outline',
 '__IC_solar__':'sunny-outline','__IC_forn__':'cube-outline','__IC_inst__':'business-outline','__IC_serv__':'flash-outline',
 '__IC_folha__':'people-outline','__IC_chevr__':'chevron-forward-outline','__IC_download__':'download-outline',
 '__IC_trash__':'trash-outline','__IC_edit__':'create-outline',
 '__IC_xls__':'grid-outline','__IC_csv__':'document-text-outline','__IC_pdf__':'document-outline','__IC_check__':'checkmark-outline',
 '__IC_pin__':'location-outline','__IC_clock__':'time-outline','__IC_left__':'chevron-back-outline','__IC_right__':'chevron-forward-outline',
 '__IC_calrange__':'calendar-outline','__IC_calcheck__':'calendar-number-outline','__IC_info__':'information-circle-outline',
 '__IC_upload__':'cloud-upload-outline','__IC_receipt__':'receipt-outline','__IC_shield__':'shield-checkmark-outline',
 '__IC_stamp__':'ribbon-outline','__IC_alert__':'warning-outline','__IC_eye__':'eye-outline','__IC_filter__':'funnel-outline',
 '__IC_link__':'link-outline','__IC_folder__':'folder-outline','__IC_file__':'document-text-outline','__IC_filecheck__':'document-text-outline',
 '__IC_fileclock__':'document-outline','__IC_filewarn__':'document-outline','__IC_hardhat__':'construct-outline',
 '__IC_landmark__':'library-outline','__IC_briefcase__':'briefcase-outline','__IC_usercheck__':'person-outline',
 '__IC_userplus__':'person-add-outline','__IC_log-in__':'log-in-outline',
 '__IC_extlink__':'open-outline','__IC_trenddown__':'trending-down-outline','__IC_calx__':'calendar-clear-outline',
 '__IC_sign__':'document-text-outline','__IC_scroll__':'document-text-outline','__IC_db__':'server-outline','__IC_inbox__':'file-tray-outline'}

import os, time, shutil, re as _re

# URL da API em produção. Defina a variável de ambiente JC_API_URL antes de
# rodar "npm run build:site" (ou "npm run build"), ex.:
#   JC_API_URL=https://sua-api.onrender.com npm run build
# Sem essa variável, o front usa o padrão http://localhost:3000 (dev local).
JC_API_URL = os.environ.get('JC_API_URL', '').strip()
JC_API_SCRIPT = ('<script>window.JC_API=' + repr(JC_API_URL) + ';</script>') if JC_API_URL else ''

ICONIFY_CDN = '<script src="https://cdn.jsdelivr.net/npm/iconify-icon@2.1.0/dist/iconify-icon.min.js"></script>'
APEX_CDN    = '<script src="https://cdn.jsdelivr.net/npm/apexcharts@3.54.1/dist/apexcharts.min.js"></script>'
FONTS_CDN   = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
               '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
               '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800'
               '&display=swap" rel="stylesheet">')
# PWA: manifest + tema + suporte a "adicionar à tela inicial" (Android/iOS)
PWA_HEAD = ('<link rel="manifest" href="manifest.webmanifest">'
            '<meta name="theme-color" content="#091128">'
            '<meta name="mobile-web-app-capable" content="yes">'
            '<meta name="apple-mobile-web-app-capable" content="yes">'
            '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
            '<meta name="apple-mobile-web-app-title" content="JC Gestão">'
            '<link rel="apple-touch-icon" href="img/icon-192.png">')
JSMAP = {'__MOVJS__':('mov','mov.web.js'), '__AGENDAJS__':('agenda','agenda.web.js'),
         '__DIASJS__':('dias','dias.web.js'), '__COLABJS__':('colab','colab.web.js'),
         '__RELJS__':('rel','rel.web.js'), '__PROJJS__':('proj','proj.web.js'), '__HOMEJS__':('home','home.web.js'),
         '__LOGINJS__':('login','login.web.js'), '__COMPJS__':('comp','comp.web.js'), '__EVOLJS__':('evol','evol.web.js')}
AUTH_SRC = os.path.join('logica-ts','dist','auth.web.js')  # guarda injetada em todas as páginas (menos login)
ENHANCE_SRC = os.path.join('logica-ts','dist','enhance.web.js')  # melhorias de UX em todas as páginas (menos login)
NOTIF_SRC = os.path.join('logica-ts','dist','notif.web.js')  # central de notificações (sino + painel) em todas as páginas

OUT = 'web'

def setup_site():
    for d in ('', 'css', 'js', 'img'):
        os.makedirs(os.path.join(OUT, d), exist_ok=True)
    # imagens da marca (o CSS e gerado pelo sass em web/css/app.css)
    shutil.copyfile('assets/icon.png',        os.path.join(OUT,'img','icon.png'))
    shutil.copyfile('assets/logo-branca.png', os.path.join(OUT,'img','logo-branca.png'))
    shutil.copyfile('assets/logo.png',        os.path.join(OUT,'img','logo.png'))
    shutil.copyfile('assets/elemento.png',    os.path.join(OUT,'img','elemento.png'))
    for _lg in ('logo-dark.png','logo-light.png','atom-dark.png','atom-light.png','elemento-dark.png','elemento-light.png'):
        shutil.copyfile('assets/'+_lg, os.path.join(OUT,'img',_lg))
    # PWA: manifest, service worker, script e ícones do app
    shutil.copyfile('manifest.webmanifest', os.path.join(OUT,'manifest.webmanifest'))
    with open('sw.js', encoding='utf-8') as _f: _sw = _f.read()
    _sw = _sw.replace('__SWVER__', str(int(time.time())))
    with open(os.path.join(OUT,'sw.js'), 'w', encoding='utf-8') as _f: _f.write(_sw)
    shutil.copyfile('pwa.js',               os.path.join(OUT,'js','pwa.js'))
    shutil.copyfile('wizard.js',            os.path.join(OUT,'js','wizard.js'))
    shutil.copyfile('logout.js',            os.path.join(OUT,'js','logout.js'))
    shutil.copyfile('tema.js',              os.path.join(OUT,'js','tema.js'))
    shutil.copyfile('som.js',               os.path.join(OUT,'js','som.js'))
    shutil.copyfile('modais.js',            os.path.join(OUT,'js','modais.js'))
    shutil.copyfile('arrastar.js',          os.path.join(OUT,'js','arrastar.js'))
    shutil.copyfile('toasts.js',            os.path.join(OUT,'js','toasts.js'))
    shutil.copyfile('mascara.js',           os.path.join(OUT,'js','mascara.js'))
    shutil.copyfile('puxar.js',             os.path.join(OUT,'js','puxar.js'))
    shutil.copyfile('esqueleto.js',         os.path.join(OUT,'js','esqueleto.js'))
    shutil.copyfile('push.js',              os.path.join(OUT,'js','push.js'))
    shutil.copyfile('profile.js',           os.path.join(OUT,'js','profile.js'))
    shutil.copyfile('notificacoes.js',      os.path.join(OUT,'js','notificacoes.js'))
    for _ic in ('icon-192.png','icon-512.png','icon-maskable-192.png','icon-maskable-512.png'):
        shutil.copyfile(os.path.join('assets', _ic), os.path.join(OUT,'img', _ic))

# script inline no <head> (síncrono, sem flash): marca a DIREÇÃO da transição
# (nav-fwd/nav-back) por índice de histórico — usado pelo deslize direcional.
# Tem atributo data-nav de propósito: assim NÃO é extraído para arquivo externo.
NAV_SCRIPT = "<script data-nav>(function(){try{var h=document.documentElement,d=sessionStorage.getItem('jc-force-dir');if(d){sessionStorage.removeItem('jc-force-dir')}var s=history.state||{},i=s.jcIdx;if(typeof i!=='number'){i=(+sessionStorage.getItem('jcIdx')||0)+1;history.replaceState(Object.assign({},s,{jcIdx:i}),'')}var p=+sessionStorage.getItem('jcIdx')||0;var back=d?d==='back':i<p;h.classList.add(back?'nav-back':'nav-fwd');sessionStorage.setItem('jcIdx',i)}catch(e){document.documentElement.classList.add('nav-fwd')}})()</script>"

def build(body, out_html, slug, title, with_apex, inject_auth=True):
    head_links = (JC_API_SCRIPT + FONTS_CDN + PWA_HEAD + '<link rel="stylesheet" href="css/app.css">' + AUTH_CSS
                  + ICONIFY_CDN + (APEX_CDN if with_apex else ''))
    html = ('<!doctype html><html lang="pt-BR" data-theme="dark"><head>'
            '<script>try{var _t=localStorage.getItem("jc-tema");if(!_t)_t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.setAttribute("data-theme",_t)}catch(e){}</script>'
            '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            '<title>JC Gestão — ' + title + '</title>' + head_links + NAV_SCRIPT
            + '</head><body>' + body + '<script src="js/pwa.js" defer></script><script src="js/wizard.js" defer></script><script src="js/logout.js" defer></script><script src="js/profile.js" defer></script><script src="js/notificacoes.js" defer></script><script src="js/tema.js" defer></script><script src="js/som.js" defer></script><script src="js/modais.js" defer></script><script src="js/arrastar.js" defer></script><script src="js/toasts.js" defer></script><script src="js/mascara.js" defer></script><script src="js/puxar.js" defer></script><script src="js/esqueleto.js" defer></script><script src="js/push.js" defer></script></body></html>')
    # guarda de autenticação: primeiro script do body (antes do bundle da página)
    if inject_auth:
        shutil.copyfile(AUTH_SRC, os.path.join(OUT,'js','auth.js'))
        shutil.copyfile(ENHANCE_SRC, os.path.join(OUT,'js','enhance.js'))
        shutil.copyfile(NOTIF_SRC, os.path.join(OUT,'js','notif.js'))
        html = html.replace('<body>', '<body><script src="js/auth.js" defer></script><script src="js/enhance.js" defer></script><script src="js/notif.js" defer></script>', 1)
    # imagens externas
    html = html.replace('__ATOM__','img/atom-dark.png').replace('__LOGO__','img/logo-dark.png').replace('__WAVE__','img/elemento-dark.png')
    # ApexCharts agora via CDN no <head>
    html = html.replace('<script>__APEX__</script>','')
    # bundles -> arquivos externos js/<slug>.js
    for tok,(name,srcfile) in JSMAP.items():
        tag = '<script>'+tok+'</script>'
        if tag in html:
            shutil.copyfile(os.path.join('logica-ts','dist',srcfile), os.path.join(OUT,'js',name+'.js'))
            html = html.replace(tag, '<script src="js/'+name+'.js" defer></script>')
    # icones -> web component Iconify (lucide)
    for k,v in ICONS.items():
        html = html.replace(k, '<iconify-icon icon="ion:'+v+'"></iconify-icon>')
    # scripts inline restantes (init de graficos) -> js/<slug>.init.js
    inits = _re.findall(r'<script>(.*?)</script>', html, _re.S)
    for n,code in enumerate(inits):
        fn = slug + ('' if len(inits)==1 else '-'+str(n+1)) + '.init.js'
        open(os.path.join(OUT,'js',fn),'w').write(code.strip()+'\n')
        html = html.replace('<script>'+code+'</script>','<script src="js/'+fn+'" defer></script>',1)
    open(os.path.join(OUT,out_html),'w').write(html)
    print('escrito', OUT+'/'+out_html, len(html)//1024,'KB')

INDEX = ('<!doctype html><html lang="pt-BR" data-theme="dark"><head>'
 '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
 '<title>JC Gestão — Protótipo</title>' + FONTS_CDN +
 '<link rel="stylesheet" href="css/app.css">' + ICONIFY_CDN +
 '<style>.idx{max-width:760px;margin:0 auto;padding:40px 20px}'
 '.idx h1{font-family:var(--font-head);font-size:26px;margin:0 0 4px}'
 '.idx p{color:var(--mut);margin:0 0 24px}'
 '.idx a{display:flex;align-items:center;gap:12px;padding:16px;margin-bottom:10px;'
 'background:var(--card);border:1px solid var(--line);border-radius:12px;color:var(--txt);font-weight:600}'
 '.idx a:hover{background:var(--card-2)}.idx a iconify-icon{font-size:22px;color:var(--accent-2)}'
 '.idx a small{display:block;color:var(--mut);font-weight:500;font-size:12.5px;margin-top:2px}</style>'
 '</head><body>'
 '<script>location.replace(localStorage.getItem("jc_token")?"home.html":"login.html")</script>'
 '<div class="idx"><h1>JC Elétrica &amp; Solar — Gestão</h1>'
 '<p>Protótipo navegável. Escolha uma tela:</p>'
 '<a href="home.html"><iconify-icon icon="ion:grid-outline"></iconify-icon><span>Início<small>Visão geral e gráfico de lucro</small></span></a>'
 '<a href="agendamentos.html"><iconify-icon icon="ion:calendar-outline"></iconify-icon><span>Agendamentos<small>Calendário, CRUD e conflitos</small></span></a>'
 '<a href="movimentacoes.html"><iconify-icon icon="ion:swap-horizontal-outline"></iconify-icon><span>Movimentações<small>Fluxo de caixa</small></span></a>'
 '<a href="relatorios.html"><iconify-icon icon="ion:folder-outline"></iconify-icon><span>Relatórios<small>Documentos, fiscal, financeiro, planilhas</small></span></a>'
 '<a href="projetos.html"><iconify-icon icon="ion:flash-outline"></iconify-icon><span>Projetos<small>Obras 360° por cliente</small></span></a>'
 '<a href="dias-trabalhados.html"><iconify-icon icon="ion:calendar-number-outline"></iconify-icon><span>Dias trabalhados<small>Jornadas da equipe</small></span></a>'
 '<a href="colaboradores.html"><iconify-icon icon="ion:people-outline"></iconify-icon><span>Colaboradores<small>Envio de foto</small></span></a>'
 '</div></body></html>')

setup_site()
open(os.path.join(OUT,'index.html'),'w').write(INDEX); print('escrito', OUT+'/index.html')
COMP_BODY = """
<div class="drawer-overlay"></div>
<div class="app">
  __SIDEBAR__
  <div class="main">
  __TOPBAR__
    <div class="content va">
      <div class="page-head">
        <div><h1>Comparativo</h1><p>Veja se este mês foi melhor que o anterior</p></div>
        <div class="ph-actions">
          <div class="chips" id="cmp-range">
            <span class="chipf" data-range="3">3 meses</span>
            <span class="chipf" data-range="6">6 meses</span>
            <span class="chipf" data-range="12">12 meses</span>
            <span class="chipf on" data-range="0">Tudo</span>
          </div>
        </div>
      </div>

      <div class="tile hero-tile">
        <div class="hero-info">
          <div class="hero-top"><small id="cmp-hero-mes">—</small><span class="live-badge"><i></i> ao vivo</span></div>
          <div class="hero-val" id="cmp-hero-val">R$ —</div>
          <div class="hero-sub" id="cmp-hero-sub">os números aparecem quando o sistema estiver ligado</div>
        </div>
        <div class="hero-chart" id="cmp-hero-chart"></div>
      </div>

      <div class="sumrow" id="cmp-kpis"></div>

      <div class="va-grid2">
        <div class="tile"><div class="tile-h">Entrou e saiu, por mês <span class="tile-meta">o que ganhou e o que gastou</span></div><div id="cmp-chart-fluxo"></div></div>
        <div class="tile"><div class="tile-h">Quanto sobrou, por mês <span class="tile-meta">como o lucro variou</span></div><div id="cmp-chart-lucro"></div></div>
      </div>

      <div class="tile">
        <div class="tile-h">Comparando os meses <span class="tile-meta" id="cmp-tab-meta"></span></div>
        <div class="cmp-tablewrap"><table class="cmp-table" id="cmp-tabela"></table></div>
      </div>
    </div>
  </div>
</div>
<script>__COMPJS__</script>
"""
COMP_BODY = COMP_BODY.replace('__SIDEBAR__',SIDEBAR('comp')).replace('__TOPBAR__',TOPBAR.replace('__PTITLE__','Comparativo'))

EVOL_BODY = """
<div class="drawer-overlay"></div>
<div class="app">
  __SIDEBAR__
  <div class="main">
  __TOPBAR__
    <div class="content va">
      <div class="page-head">
        <div><h1>Evolução</h1><p>Como o negócio e as obras vêm crescendo</p></div>
        <div class="ph-actions">
          <button class="btn btn-primary" id="ev-capturar">__IC_camera__ Capturar mês</button>
        </div>
      </div>

      <div class="tile hero-tile">
        <div class="hero-info">
          <div class="hero-top"><small id="ev-hero-mes">—</small><span class="live-badge"><i></i> ao vivo</span></div>
          <div class="hero-val" id="ev-hero-val">R$ —</div>
          <div class="hero-sub" id="ev-hero-sub">os números aparecem quando o sistema estiver ligado</div>
        </div>
        <div class="hero-chart" id="ev-hero-chart"></div>
      </div>

      <div class="sumrow" id="ev-kpis"></div>

      <div id="ev-prazo"></div>

      <div class="va-grid2">
        <div class="tile"><div class="tile-h">Quanto ainda vai receber, por mês <span class="tile-meta">trabalho já fechado</span></div><div id="ev-chart-backlog"></div></div>
        <div class="tile"><div class="tile-h">Andamento de cada obra <span class="tile-meta">avanço ao longo do tempo</span></div><div id="ev-chart-prog"></div></div>
      </div>

      <div class="tile">
        <div class="tile-h">Obras <span class="tile-meta">andamento e valores de cada obra</span></div>
        <div class="cmp-tablewrap"><table class="cmp-table" id="ev-tabela"></table></div>
      </div>
    </div>
  </div>
  <div class="toast" id="ev-toast">__IC_check__<span>Mês capturado no histórico</span></div>
</div>
<script>__EVOLJS__</script>
"""
EVOL_BODY = EVOL_BODY.replace('__SIDEBAR__',SIDEBAR('evol')).replace('__TOPBAR__',TOPBAR.replace('__PTITLE__','Evolução'))

build(HOME_BODY,   'home.html',            'home',  'Início',        True)
build(MOV_BODY,    'movimentacoes.html',   'mov',   'Movimentações', True)
build(AGENDA_BODY, 'agendamentos.html',    'agenda','Agendamentos',       True)
build(DIAS_BODY,   'dias-trabalhados.html','dias',  'Dias trabalhados',   True)
build(COLAB_BODY,  'colaboradores.html',   'colab', 'Colaboradores',      True)
build(REL_BODY,    'relatorios.html',      'rel',   'Relatórios',    True)
build(PROJ_BODY,   'projetos.html',        'proj',  'Projetos',      True)
build(COMP_BODY, 'comparativo.html', 'comp', 'Comparativo', True)
build(EVOL_BODY, 'evolucao.html', 'evol', 'Evolução', True)
build(LOGIN_BODY,    'login.html',    'login',    'Entrar',             False, inject_auth=False)

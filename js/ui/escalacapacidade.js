// Escala > Capacidade operacional: quantas OS a operação consegue atender por dia,
// a partir da escala (quem trabalha em cada dia/cidade) × quantas OS cada técnico faz por dia.
// A configuração (OS/dia) fica em configuracoes_app, chave "capacidade_operacional":
//   { padrao: { instalador: n, manutencao: n }, porTecnico: { "<id da escala>": n } }
// Leitura: quem tem login. Gravação: admin (RLS da tabela).
// Dupla = UMA equipe: vale o maior OS/dia entre os dois técnicos (não soma).
(function () {
    "use strict";

    const CHAVE = "capacidade_operacional";
    const PADRAO_INICIAL = { instalador: 4, manutencao: 6 };
    const SITUACAO = { instalador: "Instalação", manutencao: "Manutenção" };
    const DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

    const estado = {
        config: null, configEm: null, configPor: null,
        semana: 0, diaSel: null, abertas: new Set(), configurando: false, filtroCfg: ""
    };

    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const cmp = (a, b) => String(a).localeCompare(String(b), "pt-BR");
    const iso = d => EscalaDia.isoData(d);
    const podeEditar = () => typeof ehAdmin === "function" && ehAdmin();
    const nomeSemSufixo = n => String(n ?? "").replace(/\s*-\s*(VELOZ|AZUL|TE\w*MAIS)\s*$/i, "").trim();
    const terceiraDe = n => /-\s*VELOZ\s*$/i.test(String(n ?? "")) ? "Veloz" : /-\s*TE\w*MAIS\s*$/i.test(String(n ?? "")) ? "Technomais" : "";

    const CSS = `
#secao-escala-capacidade .cap-aviso{ margin-bottom:10px; padding:9px 12px; border-radius:10px; font-size:13px; background:#dcfce7; color:#15803d; }
#secao-escala-capacidade .cap-aviso.erro{ background:#fee2e2; color:#b91c1c; }
html[data-tema="dark"] #secao-escala-capacidade .cap-aviso{ background:#14391f; color:#86efac; }
html[data-tema="dark"] #secao-escala-capacidade .cap-aviso.erro{ background:#4a2020; color:#fca5a5; }
.cap-btn{ display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border-radius:10px; cursor:pointer;
    border:1px solid var(--cor-borda); background:var(--cor-fundo-card); color:var(--cor-texto); font:inherit; font-size:13px; white-space:nowrap; }
.cap-btn:hover{ border-color:var(--cor-primaria); }
.cap-btn[hidden]{ display:none; }
.cap-btn.prim{ background:var(--cor-primaria); border-color:var(--cor-primaria); color:#fff; }
.cap-tabela-wrap{ overflow-x:auto; background:var(--cor-fundo-card); border:1px solid var(--cor-borda); border-radius:14px; margin-top:14px; }
.cap-tabela{ width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
.cap-tabela th, .cap-tabela td{ padding:9px 10px; border-top:1px solid var(--cor-borda); text-align:center; white-space:nowrap; }
.cap-tabela thead th{ border-top:0; font-size:12px; color:var(--cor-texto-suave); font-weight:600; }
.cap-tabela thead th button{ font:inherit; color:inherit; background:none; border:0; cursor:pointer; padding:4px 8px; border-radius:8px; }
.cap-tabela thead th button:hover{ background:var(--cor-fundo-elevado); }
.cap-tabela th:first-child, .cap-tabela td:first-child{ text-align:left; position:sticky; left:0; background:var(--cor-fundo-card); }
.cap-tabela .sel{ background:color-mix(in srgb, var(--cor-primaria) 9%, transparent); }
.cap-tabela thead th.sel button{ color:var(--cor-primaria); font-weight:700; }
.cap-tabela .hoje-dot::after{ content:"•"; color:var(--cor-primaria); margin-left:3px; }
.cap-num{ font-size:15px; font-weight:600; }
.cap-eq{ display:block; font-size:11px; color:var(--cor-texto-suave); }
.cap-zero .cap-num{ color:var(--cor-texto-suave); font-weight:400; }
.cap-total td{ font-weight:700; background:var(--cor-fundo-elevado); }
.cap-total td:first-child{ background:var(--cor-fundo-elevado); }
.cap-cidade-btn{ font:inherit; color:var(--cor-texto); background:none; border:0; cursor:pointer; padding:0; font-weight:600; display:inline-flex; gap:6px; align-items:center; }
.cap-cidade-btn::before{ content:"▸"; color:var(--cor-texto-suave); transition:transform .15s; display:inline-block; }
.cap-cidade-btn.aberta::before{ transform:rotate(90deg); }
.cap-detalhe td{ background:var(--cor-fundo); text-align:left; padding:6px 10px 12px 28px; white-space:normal; }
.cap-detalhe ul{ list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:4px 18px; }
.cap-detalhe li{ display:flex; justify-content:space-between; gap:10px; font-size:13px; padding:3px 0; border-bottom:1px dashed var(--cor-borda); }
.cap-detalhe li span:last-child{ font-weight:600; font-variant-numeric:tabular-nums; }
.cap-tag{ display:inline-block; padding:0 7px; border-radius:999px; font-size:10.5px; margin-left:5px; background:var(--cor-fundo-elevado); border:1px solid var(--cor-borda); color:var(--cor-texto-suave); }
.cap-tag.ajuste{ border-color:var(--cor-primaria); color:var(--cor-primaria); }
.cap-nota{ color:var(--cor-texto-suave); font-size:12.5px; margin:10px 2px 0; line-height:1.5; }
/* configuração */
.cap-cfg{ background:var(--cor-fundo-card); border:1px solid var(--cor-borda); border-radius:14px; padding:16px; margin-bottom:14px; }
.cap-cfg h3{ margin:0 0 4px; font-size:16px; }
.cap-cfg p{ margin:0 0 12px; color:var(--cor-texto-suave); font-size:13px; }
.cap-cfg-padrao{ display:flex; flex-wrap:wrap; gap:14px; margin-bottom:14px; }
.cap-cfg label{ display:grid; gap:4px; font-size:12px; color:var(--cor-texto-suave); }
.cap-cfg input[type=number], .cap-cfg input[type=search]{ font:inherit; color:var(--cor-texto); background:var(--cor-fundo);
    border:1px solid var(--cor-borda); border-radius:10px; padding:7px 10px; }
.cap-cfg input[type=number]{ width:92px; text-align:center; }
.cap-cfg input[type=search]{ min-width:240px; }
.cap-cfg-grupo{ margin-top:12px; }
.cap-cfg-grupo h4{ margin:0 0 6px; font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--cor-texto-suave); }
.cap-cfg-lista{ display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:6px 18px; }
.cap-cfg-linha{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:4px 0; border-bottom:1px dashed var(--cor-borda); font-size:13px; }
.cap-cfg-linha input[type=number]{ width:72px; padding:5px 8px; }
.cap-cfg-acoes{ display:flex; gap:8px; justify-content:flex-end; margin-top:14px; flex-wrap:wrap; }
@media (max-width:720px){ .cap-cfg input[type=search]{ min-width:0; width:100%; } }`;

    // ---------- banco ----------
    async function carregarConfig() {
        const { data, error } = await supabaseClient.from("configuracoes_app")
            .select("valor, atualizado_em, atualizado_por").eq("chave", CHAVE).maybeSingle();
        if (error) throw error;
        const v = data?.valor || {};
        estado.config = {
            padrao: { ...PADRAO_INICIAL, ...(v.padrao || {}) },
            porTecnico: { ...(v.porTecnico || {}) },
            salvo: !!data
        };
        estado.configEm = data?.atualizado_em ?? null;
        estado.configPor = data?.atualizado_por ?? null;
    }

    async function gravarConfig(cfg) {
        const { data: u } = await supabaseClient.auth.getUser();
        const quem = u?.user?.email ?? null;
        const agora = new Date().toISOString();
        const valor = { padrao: cfg.padrao, porTecnico: cfg.porTecnico };
        const { error } = await supabaseClient.from("configuracoes_app")
            .upsert({ chave: CHAVE, valor, atualizado_em: agora, atualizado_por: quem });
        if (error) throw error;
        estado.config = { ...valor, salvo: true };
        estado.configEm = agora; estado.configPor = quem;
    }

    // ---------- cálculo ----------
    function osDoTecnico(tech, situacao) {
        const ajuste = estado.config.porTecnico[tech.id];
        if (ajuste !== undefined && ajuste !== null && ajuste !== "") return { valor: Number(ajuste), ajustado: true };
        return { valor: Number(estado.config.padrao[situacao] ?? 0), ajustado: false };
    }

    // Equipes do dia (dupla = 1 equipe), com cidade, setor e OS/dia
    function equipesDoDia(techs, data) {
        const dia = EscalaDia.montarDia(techs, data).filter(d => d.trabalha);
        const vistos = new Set();
        const equipes = [];
        const aux = d => (d.parceiro && d.papel === "auxiliar" ? 1 : 0);
        for (const d of [...dia].sort((a, b) => aux(a) - aux(b))) {
            if (vistos.has(d.tech.id)) continue;
            vistos.add(d.tech.id);
            const membros = [d.tech];
            if (d.parceiro) { vistos.add(d.parceiro.id); membros.push(d.parceiro); }
            const valores = membros.map(t => ({ t, ...osDoTecnico(t, d.resumo.situacao) }));
            const melhor = valores.reduce((a, b) => (b.valor > a.valor ? b : a));
            equipes.push({
                cidade: d.resumo.cidade || "Sem cidade",
                situacao: d.resumo.situacao,
                membros,
                os: melhor.valor,
                ajustado: valores.some(v => v.ajustado),
                horario: `${d.resumo.inicio}–${d.resumo.fim}`,
                temporaria: d.resumo.temporaria
            });
        }
        return equipes;
    }

    function segundaDaSemana(offset) {
        const h = new Date(); h.setHours(0, 0, 0, 0);
        const seg = new Date(h); seg.setDate(h.getDate() - ((h.getDay() + 6) % 7) + offset * 7);
        return seg;
    }

    // ---------- tela ----------
    function montarUmaVez() {
        if ($("capConteudoInterno")) return;
        const estilo = document.createElement("style");
        estilo.textContent = CSS;
        document.head.appendChild(estilo);
        $("escalaCapacidadeConteudo").innerHTML = `
            <div id="capAviso" class="cap-aviso" hidden></div>
            <div id="capConfig"></div>
            <div id="capConteudoInterno"></div>`;

        $("btnCapSemanaAnterior")?.addEventListener("click", () => { estado.semana--; estado.diaSel = null; desenhar(); });
        $("btnCapSemanaProxima")?.addEventListener("click", () => { estado.semana++; estado.diaSel = null; desenhar(); });
        $("btnCapSemanaAtual")?.addEventListener("click", () => { estado.semana = 0; estado.diaSel = null; desenhar(); });
        $("btnCapConfigurar")?.addEventListener("click", () => { estado.configurando = !estado.configurando; desenhar(); });
        $("btnCapAtualizar")?.addEventListener("click", async () => {
            if (typeof escalaTecnicosCache !== "undefined") escalaTecnicosCache = null;
            estado.config = null;
            renderizarEscalaCapacidade();
        });
    }

    function aviso(msg, erro) {
        const el = $("capAviso"); if (!el) return;
        el.textContent = msg || ""; el.hidden = !msg; el.classList.toggle("erro", !!erro);
        clearTimeout(aviso.t); if (msg && !erro) aviso.t = setTimeout(() => { el.hidden = true; }, 6000);
    }

    let techsAtuais = [];

    async function renderizarEscalaCapacidade() {
        if (!$("escalaCapacidadeConteudo")) return;
        montarUmaVez();
        const alvo = $("capConteudoInterno");
        if (!estado.config) alvo.innerHTML = '<p class="alerta-vazio">Carregando a escala e a configuração...</p>';
        try {
            const [techs] = await Promise.all([carregarEscalaTecnicos(), estado.config ? null : carregarConfig()]);
            techsAtuais = techs;
        } catch (erro) {
            alvo.innerHTML = `<p class="alerta-vazio">Não deu pra carregar: ${esc(erro.message ?? String(erro))}</p>`;
            return;
        }
        desenhar();
    }

    function desenhar() {
        const alvo = $("capConteudoInterno"); if (!alvo || !estado.config) return;
        const techs = techsAtuais;
        const btnCfg = $("btnCapConfigurar");
        if (btnCfg) btnCfg.textContent = estado.configurando ? "Fechar configuração" : "⚙ Configurar OS por técnico";

        const seg = segundaDaSemana(estado.semana);
        const dias = [...Array(7)].map((_, i) => { const d = new Date(seg); d.setDate(seg.getDate() + i); return d; });
        const hojeIso = iso(new Date());
        if (!estado.diaSel) estado.diaSel = iso(dias.find(d => iso(d) === hojeIso) || dias[0]);

        const fim = dias[6];
        const fmt = d => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        $("escalaCapacidadeResumo").textContent = `Semana de ${fmt(seg)} a ${fmt(fim)}`;
        $("btnCapSemanaAtual")?.classList.toggle("ativo", estado.semana === 0);

        desenharConfig(techs);

        if (!techs.length) { alvo.innerHTML = '<p class="alerta-vazio">Nenhum técnico cadastrado na escala ainda.</p>'; return; }

        // equipes por dia
        const porDia = dias.map(d => ({ data: d, iso: iso(d), equipes: equipesDoDia(techs, d), feriado: EscalaDia.FERIADOS[iso(d)] }));
        const sel = porDia.find(p => p.iso === estado.diaSel) || porDia[0];

        const cidades = [...new Set(porDia.flatMap(p => p.equipes.map(e => e.cidade)))]
            .sort((a, b) => {
                const tot = c => sel.equipes.filter(e => e.cidade === c).reduce((s, e) => s + e.os, 0);
                return tot(b) - tot(a) || cmp(a, b);
            });

        const soma = (lista, f = () => true) => lista.filter(f).reduce((s, e) => s + e.os, 0);
        const kpis = [
            { rot: "Capacidade do dia", val: soma(sel.equipes), suf: "OS" },
            { rot: "Equipes em campo", val: sel.equipes.length, suf: "" },
            { rot: "Instalação", val: soma(sel.equipes, e => e.situacao === "instalador"), suf: "OS" },
            { rot: "Manutenção", val: soma(sel.equipes, e => e.situacao === "manutencao"), suf: "OS" }
        ];
        const tituloDia = sel.data.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

        const celula = (lista, ativo) => {
            const v = soma(lista), n = lista.length;
            return `<td class="${ativo ? "sel" : ""}${v ? "" : " cap-zero"}"><span class="cap-num">${v || "–"}</span>${n ? `<span class="cap-eq">${n} eq.</span>` : ""}</td>`;
        };

        const linhas = cidades.map(c => {
            const aberta = estado.abertas.has(c);
            const detalhe = aberta ? detalheCidade(sel.equipes.filter(e => e.cidade === c), sel) : "";
            return `<tr>
                <td><button type="button" class="cap-cidade-btn${aberta ? " aberta" : ""}" data-cidade="${esc(c)}">${esc(c)}</button></td>
                ${porDia.map(p => celula(p.equipes.filter(e => e.cidade === c), p.iso === sel.iso)).join("")}
                <td><span class="cap-num">${soma(porDia.flatMap(p => p.equipes.filter(e => e.cidade === c)))}</span></td>
            </tr>${detalhe}`;
        }).join("");

        alvo.innerHTML = `
            ${sel.feriado ? `<div class="aviso-modulo">🎉 ${esc(tituloDia)}: feriado (${esc(sel.feriado)})</div>` : ""}
            <div class="escala-kpis" role="group" aria-label="Capacidade do dia selecionado">
                ${kpis.map(k => `<div class="escala-kpi"><span><span class="escala-kpi-rotulo">${k.rot}</span>
                    <span class="escala-kpi-valor">${k.val}${k.suf ? ` <small style="font-size:13px;font-weight:500">${k.suf}</small>` : ""}</span></span></div>`).join("")}
            </div>
            <p class="cap-nota">Dia selecionado: <strong>${esc(tituloDia.charAt(0).toUpperCase() + tituloDia.slice(1))}</strong>. Clique num dia da tabela para trocar e numa cidade para ver as equipes.</p>
            <div class="cap-tabela-wrap">
                <table class="cap-tabela">
                    <thead><tr>
                        <th>Cidade</th>
                        ${porDia.map((p, i) => `<th class="${p.iso === sel.iso ? "sel" : ""}"><button type="button" data-dia="${p.iso}" title="${p.feriado ? esc(p.feriado) : ""}">
                            <span class="${p.iso === hojeIso ? "hoje-dot" : ""}">${DIAS_CURTOS[i]}${p.feriado ? " 🎉" : ""}</span><br>${fmt(p.data)}</button></th>`).join("")}
                        <th>Semana</th>
                    </tr></thead>
                    <tbody>${linhas || `<tr><td colspan="9">Ninguém em escala nesta semana.</td></tr>`}</tbody>
                    <tfoot><tr class="cap-total">
                        <td>Total</td>
                        ${porDia.map(p => celula(p.equipes, p.iso === sel.iso)).join("")}
                        <td><span class="cap-num">${soma(porDia.flatMap(p => p.equipes))}</span></td>
                    </tr></tfoot>
                </table>
            </div>
            <p class="cap-nota">Capacidade = soma das OS/dia das equipes em escala naquele dia (folga, férias, atestado e "outras atividades" não contam; técnico deslocado conta na cidade onde está).
                Dupla conta como <strong>uma</strong> equipe e vale o maior OS/dia entre os dois.
                Padrão atual: Instalação <strong>${estado.config.padrao.instalador}</strong> OS/dia · Manutenção <strong>${estado.config.padrao.manutencao}</strong> OS/dia
                · ${Object.keys(estado.config.porTecnico).length} técnico(s) com valor próprio.
                ${estado.config.salvo ? `Configuração salva${estado.configEm ? " em " + new Date(estado.configEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""}${estado.configPor ? " por " + esc(estado.configPor) : ""}.` : "<strong>Valores iniciais de exemplo — ajuste em ⚙ Configurar.</strong>"}</p>`;

        alvo.querySelectorAll("[data-dia]").forEach(b => b.addEventListener("click", () => { estado.diaSel = b.dataset.dia; desenhar(); }));
        alvo.querySelectorAll("[data-cidade]").forEach(b => b.addEventListener("click", () => {
            const c = b.dataset.cidade;
            if (estado.abertas.has(c)) estado.abertas.delete(c); else estado.abertas.add(c);
            desenhar();
        }));
    }

    function detalheCidade(equipes, sel) {
        if (!equipes.length) return `<tr class="cap-detalhe"><td colspan="9">Nenhuma equipe nesta cidade em ${esc(sel.data.toLocaleDateString("pt-BR"))}.</td></tr>`;
        const ordem = { manutencao: 0, instalador: 1 };
        const itens = [...equipes].sort((a, b) => (ordem[a.situacao] - ordem[b.situacao]) || cmp(a.membros[0].nome, b.membros[0].nome));
        return `<tr class="cap-detalhe"><td colspan="9"><ul>${itens.map(e => {
            const nomes = e.membros.map(t => nomeSemSufixo(t.nome)).join(" + ");
            const terc = terceiraDe(e.membros[0].nome);
            return `<li><span>${esc(nomes)}<span class="cap-tag">${SITUACAO[e.situacao]}</span>${e.membros.length > 1 ? '<span class="cap-tag">dupla</span>' : ""}${terc ? `<span class="cap-tag">${terc}</span>` : ""}${e.temporaria ? '<span class="cap-tag">temp.</span>' : ""}${e.ajustado ? '<span class="cap-tag ajuste">valor próprio</span>' : ""}</span><span>${e.os} OS</span></li>`;
        }).join("")}</ul></td></tr>`;
    }

    function desenharConfig(techs) {
        const caixa = $("capConfig"); if (!caixa) return;
        if (!estado.configurando) { caixa.innerHTML = ""; return; }
        const admin = podeEditar();
        const cfg = estado.config;
        const dis = admin ? "" : " disabled";
        const filtro = estado.filtroCfg.toLowerCase();
        const porCidade = new Map();
        [...techs].sort((a, b) => cmp(a.nome, b.nome)).forEach(t => {
            if (filtro && !(`${t.nome} ${t.cidade}`.toLowerCase().includes(filtro))) return;
            const c = t.cidade || "Sem cidade";
            if (!porCidade.has(c)) porCidade.set(c, []);
            porCidade.get(c).push(t);
        });
        const setorDe = t => (t.setor === "Manutenção" ? "manutencao" : "instalador");

        caixa.innerHTML = `<div class="cap-cfg">
            <h3>Quantas OS cada técnico faz por dia</h3>
            <p>O padrão vale para todo mundo do setor. Para um técnico específico, preencha o campo dele; deixe em branco para usar o padrão.${admin ? "" : " <strong>Só administrador pode alterar.</strong>"}</p>
            <div class="cap-cfg-padrao">
                <label>Padrão Instalação (OS/dia)<input type="number" min="0" step="0.5" id="capPadInst" value="${esc(cfg.padrao.instalador)}"${dis}></label>
                <label>Padrão Manutenção (OS/dia)<input type="number" min="0" step="0.5" id="capPadMan" value="${esc(cfg.padrao.manutencao)}"${dis}></label>
                <label>Buscar técnico<input type="search" id="capBuscaCfg" placeholder="Nome ou cidade…" value="${esc(estado.filtroCfg)}"></label>
            </div>
            ${[...porCidade.keys()].sort(cmp).map(c => `<div class="cap-cfg-grupo"><h4>${esc(c)}</h4><div class="cap-cfg-lista">
                ${porCidade.get(c).map(t => {
                    const v = cfg.porTecnico[t.id];
                    const terc = terceiraDe(t.nome);
                    return `<div class="cap-cfg-linha"><span>${esc(nomeSemSufixo(t.nome))}<span class="cap-tag">${t.setor === "Manutenção" ? "Manut." : "Inst."}</span>${terc ? `<span class="cap-tag">${terc}</span>` : ""}</span>
                        <input type="number" min="0" step="0.5" data-tec="${esc(t.id)}" value="${v ?? ""}" placeholder="${esc(cfg.padrao[setorDe(t)])}"${dis} aria-label="OS por dia de ${esc(t.nome)}"></div>`;
                }).join("")}</div></div>`).join("") || '<p>Nenhum técnico nesse filtro.</p>'}
            <div class="cap-cfg-acoes">
                <button type="button" class="cap-btn" id="capCfgCancelar">Fechar</button>
                ${admin ? '<button type="button" class="cap-btn prim" id="capCfgSalvar">Salvar configuração</button>' : ""}
            </div>
        </div>`;

        // valores digitados ficam guardados enquanto filtra
        const rascunho = estado.rascunho || (estado.rascunho = { padrao: { ...cfg.padrao }, porTecnico: { ...cfg.porTecnico } });
        caixa.querySelector("#capPadInst").value = rascunho.padrao.instalador;
        caixa.querySelector("#capPadMan").value = rascunho.padrao.manutencao;
        caixa.querySelectorAll("[data-tec]").forEach(inp => { inp.value = rascunho.porTecnico[inp.dataset.tec] ?? ""; });

        caixa.querySelector("#capPadInst").addEventListener("input", e => { rascunho.padrao.instalador = Number(e.target.value || 0); atualizarPlaceholders(); });
        caixa.querySelector("#capPadMan").addEventListener("input", e => { rascunho.padrao.manutencao = Number(e.target.value || 0); atualizarPlaceholders(); });
        caixa.querySelectorAll("[data-tec]").forEach(inp => inp.addEventListener("input", () => {
            if (inp.value === "") delete rascunho.porTecnico[inp.dataset.tec];
            else rascunho.porTecnico[inp.dataset.tec] = Number(inp.value);
        }));
        function atualizarPlaceholders() {
            caixa.querySelectorAll("[data-tec]").forEach(inp => {
                const t = techs.find(x => String(x.id) === inp.dataset.tec);
                if (t) inp.placeholder = rascunho.padrao[setorDe(t)];
            });
        }
        const busca = caixa.querySelector("#capBuscaCfg");
        busca.addEventListener("input", () => {
            estado.filtroCfg = busca.value;
            const pos = busca.selectionStart;
            desenharConfig(techs);
            const nova = $("capBuscaCfg"); nova.focus(); nova.setSelectionRange(pos, pos);
        });
        caixa.querySelector("#capCfgCancelar").addEventListener("click", () => { estado.configurando = false; estado.rascunho = null; desenhar(); });
        caixa.querySelector("#capCfgSalvar")?.addEventListener("click", async e => {
            e.target.disabled = true; e.target.textContent = "Salvando…";
            try {
                const ids = new Set(techs.map(t => String(t.id)));
                const porTecnico = Object.fromEntries(Object.entries(rascunho.porTecnico)
                    .filter(([id, v]) => ids.has(String(id)) && v !== "" && v !== null && !Number.isNaN(Number(v))));
                await gravarConfig({ padrao: { instalador: Number(rascunho.padrao.instalador) || 0, manutencao: Number(rascunho.padrao.manutencao) || 0 }, porTecnico });
                estado.configurando = false; estado.rascunho = null;
                desenhar();
                aviso("Configuração salva. A capacidade já foi recalculada.");
            } catch (erro) {
                e.target.disabled = false; e.target.textContent = "Salvar configuração";
                aviso("Não foi possível salvar: " + (erro.message ?? erro), true);
            }
        });
    }

    window.renderizarEscalaCapacidade = renderizarEscalaCapacidade;
})();

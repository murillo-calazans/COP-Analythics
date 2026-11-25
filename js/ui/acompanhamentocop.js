// COP > Acompanhamento COP (25/11/2026 — TESTE LOCAL): cada atendente do COP entra com o próprio login e vê
// o SEU grupo de técnicos: técnicos (com telefone), OS agendadas do dia com as observações das mensagens
// (ex.: "só à tarde", "só atende ligação") e as OS reagendadas no dia (quem reagendou + motivo).
// Grupos em configuracoes_app, chave "acompanhamento_cop":
//   { grupos: [{ nome, responsavel, emails[], cidades[], setores[], turno, tecnicos: [{id, nome, cidade, equipe, dupla, telefone}] }] }
// Dados das OS: mesmo arquivo das OS em aberto (R2, buscarOsPendentesCacheado). Uma OS é do grupo quando:
//   1) o técnico da OS (COLABORADOR RESPONSAVEL da última movimentação) é do grupo; ou
//   2) o setor da OS é um setor do grupo (terceiras: agenda vai para a filial, não para o técnico); ou
//   3) a cidade é do grupo e a OS não tem técnico/setor de nenhum grupo ("sem técnico do grupo").
(function () {
    "use strict";

    const CHAVE = "acompanhamento_cop";
    const SETORES_FORA = new Set(["tecnico infraestrutura amo", "recolhimento terceirizado"]);   // não são dos técnicos do COP
    const EM_CAMPO = new Set(["deslocamento", "execucao"]);

    const est = { cfg: null, grupo: null, diaOffset: 0, tec: null, cache: null, editando: false, aviso: null, timer: null, aba: "agendadas" };
    const $ = id => document.getElementById(id);
    const norm = t => String(t ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
    const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const z = n => String(n).padStart(2, "0");
    const isoDia = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
    const dataBR = s => {
        const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/);
        return m && m[3] !== "0000" ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) : null;
    };
    const hora = d => d ? `${z(d.getHours())}:${z(d.getMinutes())}` : "";
    const nomeBonito = s => String(s || "").trim().toLowerCase()
        .replace(/(^|[\s\-\/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, w => w.toLowerCase());
    const curto = n => { const p = String(n || "").replace(/\s*-\s*(VELOZ|TECHNOMAIS|AZUL)\s*$/i, "").trim().split(/\s+/); return p.length > 2 ? `${p[0]} ${p[p.length - 1]}` : p.join(" "); };
    const diaAlvo = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + est.diaOffset); return d; };
    const rotuloDia = () => {
        const d = diaAlvo(), o = est.diaOffset;
        const nome = o === 0 ? "Hoje" : o === 1 ? "Amanhã" : o === -1 ? "Ontem" : d.toLocaleDateString("pt-BR", { weekday: "long" });
        return `${nome.charAt(0).toUpperCase() + nome.slice(1)}, ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
    };
    const fones = t => String(t || "").split(/[\/,;]+/).map(x => x.replace(/\D/g, "")).filter(x => x.length >= 10);
    const foneFmt = f => f.length === 11 ? `(${f.slice(0, 2)}) ${f.slice(2, 7)}-${f.slice(7)}` : f.length === 10 ? `(${f.slice(0, 2)}) ${f.slice(2, 6)}-${f.slice(6)}` : f;

    // ---------- observações tiradas das mensagens da OS ----------
    // (o texto já chega sem acento e minúsculo — norm)
    const REGRAS_OBS = [
        { rot: "Só à tarde", cls: "hora", re: /(so|somente|apenas|prefere|preferencia|pode|consegue|estara|esta)\s(\S+\s){0,4}(a|na|de|pela|parte da)\s+tarde|(turno|periodo) da tarde/ },
        { rot: "Só de manhã", cls: "hora", re: /(so|somente|apenas|prefere|preferencia|pode|consegue|estara|esta)\s(\S+\s){0,4}(a|na|de|pela|parte da)\s+manha|(turno|periodo) da manha/ },
        { rot: "1º horário", cls: "hora", re: /(1[ºo°]|primeiro)\s*horario/ },
        { rot: "Horário pedido", cls: "hora", re: /(a partir|apos|depois|antes)\s+d[aeo]s?\s+\d{1,2}\s*(h|:|hs|hrs|horas)|(as|para as)\s+\d{1,2}(:\d\d)?\s*(h|hs|hrs|horas)/ },
        { rot: "Só atende ligação", cls: "contato", re: /(so|somente|apenas)\s(\S+\s){0,3}(por\s)?(ligacao|ligar|telefone|chamada)|nao (tem|usa|possui) (whats|zap|wpp)/ },
        { rot: "Só WhatsApp", cls: "contato", re: /(so|somente|apenas)\s(\S+\s){0,3}(por\s)?(whats|zap|wpp|mensagem)/ },
        { rot: "Ligar antes", cls: "contato", re: /(ligar|ligacao|contato|avisar|entrar em contato)\s(\S+\s){0,3}antes|antes de (ir|sair|chegar|passar)/ },
        { rot: "Urgência", cls: "alerta", re: /urgen|trabalha em casa|home ?office/ },
        { rot: "Fim de semana", cls: "alerta", re: /sabado|domingo|fim de semana|final de semana/ },
        { rot: "Vai avisar", cls: "alerta", re: /(vai|ira) (avisar|retornar|entrar em contato)|aguardar (o )?(retorno|contato) do cliente/ },
        { rot: "Cachorro", cls: "local", re: /cachorro|cao bravo|caes/ },
        { rot: "Portão/portaria", cls: "local", re: /portao|portaria|interfone|porteiro|condominio/ },
        { rot: "Idoso/acessib.", cls: "local", re: /idos[oa]|cadeirante|acamad/ }
    ];
    // mensagem do sistema (não é texto de gente)
    const ehSistema = m => !m || /^(ordem|o\.s\.?|os) (assumida|aberta|encaminhada|finalizada|executada)|^altera[cç][aã]o de (setor|dados)|^ajuste de setor|^chamado aberto|^agendamento de ordem de servi|^usu[aá]rio .{3,60}, iniciou o deslocamento|^\S+ - ordem para \S+\.?$/i.test(String(m).trim());

    function observacoes(msgs) {
        const achou = new Map();
        for (const m of [...msgs].sort((a, b) => (b.data || 0) - (a.data || 0))) {
            if (ehSistema(m.msg)) continue;
            const t = norm(m.msg);
            for (const r of REGRAS_OBS) if (!achou.has(r.rot) && r.re.test(t)) achou.set(r.rot, { ...r, fonte: m.msg, data: m.data });
        }
        return [...achou.values()];
    }

    // ---------- modelo ----------
    function montar(linhas) {
        const porOs = new Map(), reag = [];
        for (const l of linhas) {
            const r = l.dados || l;
            const id = String(r["ID OS"] ?? "").trim();
            if (!id) continue;
            const quando = dataBR(r.DATA);
            let o = porOs.get(id);
            if (!o) {
                o = { id, cliente: String(r.CLIENTE || "").trim(), assunto: String(r.ASSUNTO || "").trim(), cidade: nomeBonito(r.CIDADE),
                    bairro: nomeBonito(r.BAIRRO), setor: String(r.SETOR || "").trim(), login: String(r.LOGIN || "").trim(),
                    agenda: null, status: "", tecId: "", ultima: null, msgs: [] };
                porOs.set(id, o);
            }
            const col = String(r["COLABORADOR RESPONSAVEL"] ?? "").trim();
            const hist = String(r.HISTARICO || "");
            const msg = { data: quando, status: String(r.STATUS || "").trim(), msg: String(r.MENSAGEM || "").trim(), hist, col,
                tarefa: String(r["PRAXIMA TAREFA"] || "").trim(), resposta: String(r["RESPOSTA PADRAO"] || "").trim() };
            o.msgs.push(msg);
            if (!o.setor && r.SETOR) o.setor = String(r.SETOR).trim();
            if (quando && (!o.ultima || quando >= o.ultima)) {
                o.ultima = quando; o.status = msg.status;
                o.agenda = dataBR(r.AGENDAMENTO);
                if (col && col !== "0") o.tecId = col;
            }
            if (/reagendou/i.test(hist) && quando) {
                const quem = (hist.match(/Usu[aá]rio\s+(.+?)\s*,\s*reagendou/i) || [])[1] || "";
                reag.push({ os: o, data: quando, quem: quem.trim(), col, msg: msg.msg, resposta: msg.resposta, status: msg.status });
            }
        }
        // técnico da OS: última movimentação com colaborador (a última pode ser do sistema, com 0)
        for (const o of porOs.values()) if (!o.tecId) {
            const m = o.msgs.filter(x => x.col && x.col !== "0" && x.data).sort((a, b) => b.data - a.data)[0];
            if (m) o.tecId = m.col;
        }
        const geradoEm = linhas[0] && linhas[0].capturado_em;
        return { porOs, reag, geradoEm, lidoEm: Date.now() };
    }

    // ---------- grupos ----------
    const grupos = () => (est.cfg && est.cfg.grupos) || [];
    function indices() {
        const tecGrupo = new Map(), setorGrupo = new Map(), nomeTec = new Map();
        grupos().forEach((g, gi) => {
            (g.tecnicos || []).forEach(t => {
                if (t.id) tecGrupo.set(String(t.id), gi);
                nomeTec.set(norm(t.nome).replace(/\s*-\s*(veloz|technomais|azul)$/, ""), { gi, t });
            });
            (g.setores || []).forEach(s => setorGrupo.set(norm(s), gi));
        });
        return { tecGrupo, setorGrupo, nomeTec };
    }
    /** {dono:'tec'|'setor'|'cidade', tec} se a OS é do grupo gi; senão null */
    function daOsNoGrupo(o, gi, idx) {
        const g = grupos()[gi];
        if (o.tecId && idx.tecGrupo.get(o.tecId) === gi) return { dono: "tec", tec: g.tecnicos.find(t => String(t.id) === o.tecId) };
        const sg = idx.setorGrupo.get(norm(o.setor));
        if (sg !== undefined) return sg === gi ? { dono: "setor", tec: null } : null;
        if (o.tecId && idx.tecGrupo.has(o.tecId)) return null;
        if ((g.cidades || []).some(c => norm(c) === norm(o.cidade))) return { dono: "cidade", tec: null };
        return null;
    }
    function tecPorNome(nome, gi, idx) {
        const n = norm(nome); if (!n) return null;
        for (const [k, v] of idx.nomeTec) if (v.gi === gi && (k === n || (k.split(" ")[0] === n.split(" ")[0] && k.split(" ").pop() === n.split(" ").pop()))) return v.t;
        return null;
    }

    function dadosDoGrupo(gi) {
        const idx = indices(), g = grupos()[gi], alvo = isoDia(diaAlvo());
        const agendadas = [], reagendadas = [], emCampo = [];
        for (const o of est.cache.porOs.values()) {
            if (SETORES_FORA.has(norm(o.setor))) continue;
            const d = daOsNoGrupo(o, gi, idx);
            if (!d) continue;
            const st = norm(o.status);
            if (o.agenda && isoDia(o.agenda) === alvo && st !== "finalizada") agendadas.push({ ...o, dono: d.dono, tec: d.tec, obs: observacoes(o.msgs) });
            if (EM_CAMPO.has(st) && d.tec) emCampo.push({ ...o, tec: d.tec });
        }
        for (const r of est.cache.reag) {
            if (isoDia(r.data) !== alvo || SETORES_FORA.has(norm(r.os.setor))) continue;
            // quem reagendou é técnico de algum grupo? então vai para o grupo dele (e só dele)
            const giNome = grupos().findIndex((x, i) => tecPorNome(r.quem, i, idx));
            if (giNome >= 0 && giNome !== gi) continue;
            const tNome = giNome === gi ? tecPorNome(r.quem, gi, idx) : null;
            const tRow = r.col && idx.tecGrupo.get(r.col) === gi ? g.tecnicos.find(t => String(t.id) === r.col) : null;
            if (!tNome && r.col && idx.tecGrupo.has(r.col) && idx.tecGrupo.get(r.col) !== gi) continue;
            const d = daOsNoGrupo(r.os, gi, idx);
            if (!tRow && !tNome && !d) continue;
            reagendadas.push({ ...r, tec: tNome || tRow || (d && d.tec) || null });
        }
        agendadas.sort((a, b) => (a.agenda - b.agenda) || a.id.localeCompare(b.id));
        reagendadas.sort((a, b) => b.data - a.data);
        return { g, agendadas, reagendadas, emCampo };
    }

    function grupoDoUsuario() {
        const email = norm(APP?.usuario?.email);
        return grupos().findIndex(g => (g.emails || []).some(e => norm(e) === email));
    }
    const podeEditar = () => typeof ehAdmin === "function" && ehAdmin();
    const podeTrocarGrupo = () => podeEditar() || grupoDoUsuario() < 0;

    // ---------- tela ----------
    function render() {
        const alvo = $("acompCopConteudo");
        if (!alvo) return;
        estilo();
        if (est.editando) { alvo.innerHTML = htmlEditor(); ligarEditor(alvo); return; }
        if (!grupos().length) { alvo.innerHTML = `<div class="acp-card acp-vazio">Nenhum grupo configurado ainda.${podeEditar() ? ` <button class="acp-btn" data-ac-editar>⚙ Configurar grupos</button>` : ""}</div>`; ligar(alvo); return; }
        if (est.grupo === null || !grupos()[est.grupo]) { const m = grupoDoUsuario(); est.grupo = m >= 0 ? m : 0; }
        if (!est.cache) { alvo.innerHTML = `<div class="acp-card acp-vazio">Carregando as OS…</div>`; return; }
        const D = dadosDoGrupo(est.grupo);
        const tecSel = est.tec;
        const filtraTec = arr => tecSel ? arr.filter(x => x.tec && String(x.tec.id || x.tec.nome) === tecSel) : arr;
        alvo.innerHTML = htmlTopo(D) + htmlKpis(D) + `<div class="acp-colunas">${htmlTecnicos(D)}<div class="acp-principal">${htmlAbas(D, filtraTec)}</div></div>`;
        ligar(alvo, D);
    }

    function htmlTopo({ g }) {
        const atualizado = est.cache.geradoEm ? new Date(est.cache.geradoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
        const sel = podeTrocarGrupo()
            ? `<select class="acp-sel" data-ac-grupo aria-label="Grupo">${grupos().map((x, i) => `<option value="${i}" ${i === est.grupo ? "selected" : ""}>${esc(x.nome)} — ${esc(x.responsavel || "")}</option>`).join("")}</select>`
            : `<strong class="acp-grupo-nome">${esc(g.nome)}</strong>`;
        return `
          ${est.aviso ? `<div class="acp-aviso ${est.aviso.erro ? "erro" : ""}">${esc(est.aviso.texto)}</div>` : ""}
          <div class="acp-topo">
            <div class="acp-topo-esq">
              ${sel}
              <span class="acp-suave">Responsável: <b>${esc(g.responsavel || "—")}</b>${g.turno ? ` · ${esc(g.turno)}` : ""}</span>
            </div>
            <div class="acp-dia">
              <button type="button" class="acp-seta" data-ac-dia="-1" aria-label="Dia anterior">‹</button>
              <button type="button" class="acp-chip ${est.diaOffset === 0 ? "on" : ""}" data-ac-ir="0">Hoje</button>
              <button type="button" class="acp-chip ${est.diaOffset === 1 ? "on" : ""}" data-ac-ir="1">Amanhã</button>
              <button type="button" class="acp-seta" data-ac-dia="1" aria-label="Próximo dia">›</button>
              <strong class="acp-dia-rot">${esc(rotuloDia())}</strong>
            </div>
            <div class="acp-acoes">
              ${atualizado ? `<span class="acp-suave">IXC às ${atualizado}</span>` : ""}
              <button type="button" class="acp-btn" data-ac-recarregar title="Buscar de novo">↻</button>
              ${podeEditar() ? `<button type="button" class="acp-btn" data-ac-editar>⚙ Grupos</button>` : ""}
            </div>
          </div>`;
    }

    function htmlKpis({ g, agendadas, reagendadas, emCampo }) {
        const comObs = agendadas.filter(o => o.obs.length).length;
        const k = (rot, v, extra = "") => `<div class="acp-kpi ${extra}"><span>${rot}</span><b>${v}</b></div>`;
        return `<div class="acp-kpis">
            ${k("Técnicos", (g.tecnicos || []).length)}
            ${k("OS agendadas", agendadas.length, "prim")}
            ${k("Com observação", comObs, comObs ? "alerta" : "")}
            ${k("Reagendadas no dia", reagendadas.length, reagendadas.length ? "aviso" : "")}
            ${est.diaOffset === 0 ? k("Em campo agora", emCampo.length) : ""}
          </div>`;
    }

    function htmlTecnicos({ g, agendadas, reagendadas, emCampo }) {
        const cont = (arr, t) => arr.filter(x => x.tec && x.tec === t).length;
        const linhas = (g.tecnicos || []).map(t => {
            const chave = String(t.id || t.nome);
            const nAg = cont(agendadas, t), nRe = cont(reagendadas, t), campo = emCampo.find(x => x.tec === t);
            const fs = fones(t.telefone);
            return `<li class="acp-tec ${est.tec === chave ? "on" : ""}">
                <button type="button" class="acp-tec-nome" data-ac-tec="${esc(chave)}" title="Filtrar as OS deste técnico">
                  <span class="acp-ponto ${campo ? "campo" : nAg ? "agenda" : ""}" title="${campo ? `Em ${esc(campo.status.toLowerCase())} na OS ${esc(campo.id)}` : ""}"></span>
                  <b>${esc(curto(t.nome))}</b>
                  <span class="acp-suave">${esc([t.cidade, t.equipe].filter(Boolean).join(" · "))}${t.dupla ? ` · dupla ${esc(curto(t.dupla))}` : ""}</span>
                </button>
                <span class="acp-tec-num">${nAg ? `<span class="acp-pill" title="OS agendadas">${nAg}</span>` : ""}${nRe ? `<span class="acp-pill re" title="Reagendadas">${nRe}↺</span>` : ""}</span>
                <span class="acp-fones">${fs.length ? fs.map(f => `<span class="acp-fone"><a href="tel:+55${f}" title="Ligar">${foneFmt(f)}</a><button type="button" class="acp-copiar" data-ac-copiar="${f}" title="Copiar o número">Copiar</button><a class="acp-wa" href="https://wa.me/55${f}" target="_blank" rel="noopener" title="WhatsApp">WhatsApp</a></span>`).join("") : `<span class="acp-suave">sem telefone</span>`}</span>
              </li>`;
        }).join("");
        const todos = (g.tecnicos || []).filter(t => fones(t.telefone).length)
            .map(t => `${curto(t.nome)}${t.cidade ? ` (${t.cidade})` : ""} - ${fones(t.telefone).map(foneFmt).join(" / ")}`).join("\n");
        return `<aside class="acp-card acp-tecs">
            <div class="acp-card-tit">Técnicos do grupo ${est.tec ? `<button type="button" class="acp-limpar" data-ac-tec="">× todos</button>` : ""}
              ${todos ? `<button type="button" class="acp-copiar acp-copiar-todos" data-ac-copiar="${esc(todos)}" title="Copia nome e número de todos, um por linha">Copiar todos os números</button>` : ""}</div>
            <ul>${linhas}</ul>
            <div class="acp-legenda"><span><i class="acp-ponto campo"></i>em campo agora</span><span><i class="acp-ponto agenda"></i>tem OS no dia</span></div>
          </aside>`;
    }

    function htmlAbas(D, filtraTec) {
        const ag = filtraTec(D.agendadas), re = filtraTec(D.reagendadas);
        return `<div class="acp-abas">
              <button type="button" class="${est.aba === "agendadas" ? "on" : ""}" data-ac-aba="agendadas">Ordens agendadas <b>${ag.length}</b></button>
              <button type="button" class="${est.aba === "reagendadas" ? "on" : ""}" data-ac-aba="reagendadas">Reagendadas <b>${re.length}</b></button>
            </div>
            ${est.aba === "agendadas" ? htmlAgendadas(ag) : htmlReagendadas(re)}`;
    }

    const chipObs = o => `<span class="acp-obs ${o.cls}" title="${esc((o.data ? o.data.toLocaleString("pt-BR").slice(0, 17) + " — " : "") + o.fonte)}">${esc(o.rot)}</span>`;
    const ultimaMsg = o => {
        const m = [...o.msgs].filter(x => x.data && x.msg && !ehSistema(x.msg)).sort((a, b) => b.data - a.data)[0];
        return m ? `<div class="acp-msg" title="${esc(m.msg)}"><span class="acp-suave">${m.data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span> ${esc(m.msg.length > 160 ? m.msg.slice(0, 160) + "…" : m.msg)}</div>` : "";
    };
    const stCls = s => "acp-st-" + norm(s).replace(/\s+/g, "-");

    function htmlAgendadas(lista) {
        if (!lista.length) return `<div class="acp-card acp-vazio">Nenhuma OS em aberto agendada para ${esc(rotuloDia().toLowerCase())} neste grupo.</div>`;
        // agrupa por técnico (OS da terceira/cidade sem técnico do grupo vão para o fim)
        const blocos = new Map();
        for (const o of lista) {
            const k = o.tec ? o.tec.nome : o.dono === "setor" ? `${o.setor} (filial — sem técnico definido)` : "Sem técnico do grupo (pela cidade)";
            (blocos.get(k) || blocos.set(k, []).get(k)).push(o);
        }
        const ordem = [...blocos.keys()].sort((a, b) => (/^Sem|filial/.test(a) - /^Sem|filial/.test(b)) || a.localeCompare(b, "pt-BR"));
        return ordem.map(k => {
            const os = blocos.get(k);
            return `<div class="acp-card acp-bloco">
              <div class="acp-card-tit">${esc(/^Sem|filial/.test(k) ? k : curto(k))} <span class="acp-suave">${os.length} OS</span></div>
              <div class="acp-tab-wrap"><table class="acp-tab">
                <thead><tr><th>Hora</th><th>OS</th><th>Cliente</th><th>Assunto</th><th>Bairro</th><th>Status</th><th>Observações / última mensagem</th></tr></thead>
                <tbody>${os.map(o => `<tr>
                  <td class="acp-hora">${hora(o.agenda)}</td>
                  <td><a href="#" data-ac-os="${esc(o.id)}">${esc(o.id)}</a></td>
                  <td>${esc(o.cliente)}</td>
                  <td class="acp-assunto">${esc(o.assunto)}</td>
                  <td>${esc(o.bairro)}${o.cidade && o.dono !== "tec" ? ` <span class="acp-suave">· ${esc(o.cidade)}</span>` : ""}</td>
                  <td><span class="acp-status ${stCls(o.status)}">${esc(o.status || "—")}</span></td>
                  <td class="acp-obs-cel">${o.obs.map(chipObs).join("")}${ultimaMsg(o)}</td>
                </tr>`).join("")}</tbody>
              </table></div>
            </div>`;
        }).join("");
    }

    function htmlReagendadas(lista) {
        if (!lista.length) return `<div class="acp-card acp-vazio">Nenhuma OS do grupo reagendada em ${esc(rotuloDia().toLowerCase())}.</div>`;
        return `<div class="acp-card">
            <div class="acp-tab-wrap"><table class="acp-tab">
              <thead><tr><th>Hora</th><th>OS</th><th>Cliente</th><th>Quem reagendou</th><th>Motivo / mensagem</th><th>Situação agora</th></tr></thead>
              <tbody>${lista.map(r => `<tr>
                <td class="acp-hora">${hora(r.data)}</td>
                <td><a href="#" data-ac-os="${esc(r.os.id)}">${esc(r.os.id)}</a></td>
                <td>${esc(r.os.cliente)}<div class="acp-suave">${esc([r.os.bairro, r.os.cidade].filter(Boolean).join(" · "))}</div></td>
                <td>${esc(nomeBonito(r.quem) || "—")}${r.tec && norm(curto(r.tec.nome)) !== norm(curto(r.quem)) ? `<div class="acp-suave">técnico: ${esc(curto(r.tec.nome))}</div>` : ""}</td>
                <td class="acp-motivo">${(() => {
                    const resp = r.resposta.trim(), msg = r.msg.trim();
                    const resto = resp && norm(msg).startsWith(norm(resp)) ? msg.slice(resp.length).replace(/^[\s.\-–:]+/, "") : msg;
                    return (resp ? `<b>${esc(resp)}</b>${resto ? "<br>" : ""}` : "") + esc(resto || (resp ? "" : "—"));
                })()}</td>
                <td><span class="acp-status ${stCls(r.os.status)}">${esc(r.os.status || "—")}</span>${r.os.agenda ? `<div class="acp-suave">agenda ${r.os.agenda.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>` : ""}</td>
              </tr>`).join("")}</tbody>
            </table></div>
          </div>`;
    }

    function abrirHistorico(id) {
        const o = est.cache && est.cache.porOs.get(String(id));
        const corpo = $("modalOsIxcCorpo"), titulo = $("modalOsIxcTitulo");
        if (!o || !corpo || !titulo || typeof abrirModal !== "function") return;
        const msgs = o.msgs.filter(m => m.data).sort((a, b) => a.data - b.data);
        const obs = observacoes(o.msgs);
        titulo.textContent = `OS ${id}`;
        corpo.innerHTML = `
          <div class="modal-resumo resumo-grid">
            <div><span>Cliente</span><strong>${esc(o.cliente || "—")}</strong></div>
            <div><span>Cidade / Bairro</span><strong>${esc(o.cidade || "—")} / ${esc(o.bairro || "—")}</strong></div>
            <div><span>Assunto</span><strong>${esc(o.assunto || "—")}</strong></div>
            <div><span>Setor</span><strong>${esc(o.setor || "—")}</strong></div>
            <div><span>Agendada para</span><strong>${o.agenda ? esc(o.agenda.toLocaleString("pt-BR").slice(0, 17)) : "—"}</strong></div>
          </div>
          ${obs.length ? `<div class="acp-modal-obs">${obs.map(chipObs).join("")}</div>` : ""}
          <ol class="ixc-timeline">${msgs.map(m => `
            <li class="ixc-timeline-item">
              <div class="ixc-timeline-topo">
                <span class="ixc-timeline-data">${m.data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                <span class="acp-status ${stCls(m.status)}">${esc(m.status || "—")}</span>
              </div>
              ${m.hist ? `<div class="ixc-timeline-evento">${esc(m.hist)}</div>` : ""}
              ${m.msg ? `<div class="ixc-timeline-msg">${esc(m.msg)}</div>` : ""}
            </li>`).join("")}</ol>`;
        abrirModal("modalOsIxc");
    }

    function ligar(alvo) {
        const on = (sel, ev, fn) => alvo.querySelectorAll(sel).forEach(b => b.addEventListener(ev, fn));
        on("[data-ac-dia]", "click", e => { est.diaOffset += Number(e.currentTarget.dataset.acDia); render(); });
        on("[data-ac-ir]", "click", e => { est.diaOffset = Number(e.currentTarget.dataset.acIr); render(); });
        on("[data-ac-grupo]", "change", e => { est.grupo = Number(e.target.value); est.tec = null; render(); });
        on("[data-ac-tec]", "click", e => { const k = e.currentTarget.dataset.acTec; est.tec = !k || est.tec === k ? null : k; render(); });
        on("[data-ac-aba]", "click", e => { est.aba = e.currentTarget.dataset.acAba; render(); });
        on("[data-ac-os]", "click", e => { e.preventDefault(); abrirHistorico(e.currentTarget.dataset.acOs); });
        on("[data-ac-recarregar]", "click", () => carregarOs(true));
        on("[data-ac-editar]", "click", () => { est.editando = true; est.aviso = null; render(); });
        on("[data-ac-copiar]", "click", async e => {
            const b = e.currentTarget, txt = b.dataset.acCopiar, antes = b.textContent;
            try { await navigator.clipboard.writeText(txt); }
            catch { const t = document.createElement("textarea"); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
            b.textContent = "Copiado ✓"; b.classList.add("ok");
            setTimeout(() => { b.textContent = antes; b.classList.remove("ok"); }, 1500);
        });
    }

    // ---------- edição dos grupos (admin) ----------
    const linhaTec = t => [t.id, t.nome, t.cidade, t.equipe, t.telefone, t.dupla].map(v => String(v ?? "").replace(/\|/g, "/")).join(" | ");
    function htmlEditor() {
        return `<div class="acp-card acp-form">
            <p class="acp-suave">Um bloco por grupo. <b>Logins</b> = e-mails de quem entra no site e vê este grupo. <b>Setores</b> = OS desse setor são do grupo (terceiras). <b>Cidades</b> = OS da cidade sem técnico de nenhum grupo também aparecem.<br>
            Técnicos: um por linha — <code>ID IXC | Nome | Cidade | Equipe | Telefone | Dupla</code>.</p>
            ${grupos().map((g, i) => `<fieldset class="acp-gform" data-ac-g="${i}">
              <div class="acp-grid">
                <label>Nome do grupo<input data-f="nome" value="${esc(g.nome)}"></label>
                <label>Responsável<input data-f="responsavel" value="${esc(g.responsavel || "")}"></label>
                <label>Turno / observação<input data-f="turno" value="${esc(g.turno || "")}"></label>
              </div>
              <div class="acp-grid">
                <label>Logins (e-mails, separados por vírgula)<input data-f="emails" value="${esc((g.emails || []).join(", "))}"></label>
                <label>Setores do IXC<input data-f="setores" value="${esc((g.setores || []).join(", "))}"></label>
                <label>Cidades<input data-f="cidades" value="${esc((g.cidades || []).join(", "))}"></label>
              </div>
              <label>Técnicos<textarea data-f="tecnicos" rows="${Math.min(16, (g.tecnicos || []).length + 2)}">${esc((g.tecnicos || []).map(linhaTec).join("\n"))}</textarea></label>
              <div class="acp-acoes-form"><button type="button" class="acp-btn perigo" data-ac-remover="${i}">Remover grupo</button></div>
            </fieldset>`).join("")}
            <div class="acp-acoes-form">
              <button type="button" class="acp-btn" data-ac-novo>+ Grupo</button>
              <span style="flex:1"></span>
              <button type="button" class="acp-btn" data-ac-cancelar>Cancelar</button>
              <button type="button" class="acp-btn prim" data-ac-salvar>Salvar</button>
            </div>
          </div>`;
    }
    const lista = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
    function lerEditor(alvo) {
        return { grupos: [...alvo.querySelectorAll("[data-ac-g]")].map(f => {
            const v = k => f.querySelector(`[data-f="${k}"]`).value;
            return { nome: v("nome").trim() || "Grupo", responsavel: v("responsavel").trim(), turno: v("turno").trim(),
                emails: lista(v("emails")).map(e => e.toLowerCase()), setores: lista(v("setores")), cidades: lista(v("cidades")),
                tecnicos: v("tecnicos").split(/\r?\n/).map(l => l.split("|").map(x => x.trim())).filter(p => p[1] || p[0])
                    .map(([id, nome, cidade, equipe, telefone, dupla]) => ({ id: (id || "").replace(/\D/g, ""), nome: nome || "", cidade: cidade || "", equipe: equipe || "", telefone: telefone || "", dupla: dupla || "" })) };
        }) };
    }
    function ligarEditor(alvo) {
        alvo.querySelector("[data-ac-cancelar]").addEventListener("click", () => { est.editando = false; render(); });
        alvo.querySelector("[data-ac-novo]").addEventListener("click", () => { est.cfg = lerEditor(alvo); est.cfg.grupos.push({ nome: "Novo grupo", responsavel: "", emails: [], setores: [], cidades: [], tecnicos: [] }); render(); });
        alvo.querySelectorAll("[data-ac-remover]").forEach(b => b.addEventListener("click", () => {
            const c = lerEditor(alvo); const g = c.grupos[+b.dataset.acRemover];
            if (!confirm(`Remover o grupo "${g.nome}"?`)) return;
            c.grupos.splice(+b.dataset.acRemover, 1); est.cfg = c; render();
        }));
        alvo.querySelector("[data-ac-salvar]").addEventListener("click", async e => {
            const cfg = lerEditor(alvo);
            e.currentTarget.disabled = true;
            try {
                const { error } = await supabaseClient.from("configuracoes_app").upsert({ chave: CHAVE, valor: cfg,
                    atualizado_em: new Date().toISOString(), atualizado_por: APP?.usuario?.email || "" });
                if (error) throw error;
                est.cfg = cfg; est.editando = false; est.grupo = null; est.aviso = { texto: "Grupos salvos." };
            } catch (err) { est.aviso = { texto: "Não salvou: " + (err.message || err), erro: true }; e.currentTarget.disabled = false; }
            render();
        });
    }

    // ---------- carga ----------
    async function carregarCfg() {
        const { data, error } = await supabaseClient.from("configuracoes_app").select("valor").eq("chave", CHAVE).maybeSingle();
        if (error) throw error;
        est.cfg = data && data.valor && Array.isArray(data.valor.grupos) ? data.valor : { grupos: [] };
    }
    async function carregarOs(forcar) {
        try {
            if (forcar && typeof invalidarCacheOsPendentes === "function") invalidarCacheOsPendentes();
            const linhas = await buscarOsPendentesCacheado();
            est.cache = montar(linhas || []);
            est.aviso = null;
        } catch (e) {
            console.error("Acompanhamento COP:", e);
            est.aviso = { texto: "Não consegui carregar as OS: " + (e.message || e), erro: true };
        }
        render();
    }
    async function renderizar() {
        const alvo = $("acompCopConteudo");
        if (!alvo) return;
        estilo();
        try { if (!est.cfg) await carregarCfg(); }
        catch (e) { alvo.innerHTML = `<div class="acp-card acp-vazio">Não consegui ler os grupos: ${esc(e.message || e)}</div>`; return; }
        render();
        if (!est.cache || Date.now() - est.cache.lidoEm > 120000) await carregarOs(false);
        // atualiza sozinho a cada 5 min enquanto a aba estiver aberta
        clearInterval(est.timer);
        est.timer = setInterval(() => {
            if (!$("secao-acompanhamento-cop")?.classList.contains("ativa")) return clearInterval(est.timer);
            if (!est.editando) carregarOs(true);
        }, 300000);
    }

    function estilo() {
        if ($("estilo-acomp-cop")) return;
        const s = document.createElement("style");
        s.id = "estilo-acomp-cop";
        s.textContent = `
#acompCopConteudo{display:flex;flex-direction:column;gap:14px}
.acp-topo{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.acp-topo-esq{display:flex;flex-direction:column;gap:3px}
.acp-grupo-nome{font-size:1.15rem}
.acp-dia,.acp-acoes{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.acp-dia-rot{margin-left:6px}
.acp-seta,.acp-chip,.acp-btn{border:1px solid var(--cor-borda);background:var(--cor-fundo-card);color:var(--cor-texto);border-radius:999px;padding:6px 14px;font:inherit;font-size:.88rem;cursor:pointer}
.acp-seta{padding:6px 11px;line-height:1}
.acp-chip.on,.acp-btn.prim{background:var(--cor-primaria);border-color:var(--cor-primaria);color:#fff}
.acp-btn.perigo{color:#b91c1c}
.acp-sel{border:1px solid var(--cor-borda);border-radius:999px;padding:7px 14px;background:var(--cor-fundo-card);color:var(--cor-texto);font:inherit;font-weight:600;max-width:100%}
.acp-suave{color:var(--cor-texto-suave);font-size:.82rem;font-weight:400}
.acp-aviso{padding:9px 12px;border-radius:10px;font-size:.88rem;background:#dcfce7;color:#15803d}
.acp-aviso.erro{background:#fee2e2;color:#b91c1c}
.acp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.acp-kpi{padding:12px 16px;border:1px solid var(--cor-borda);border-radius:14px;background:var(--cor-fundo-card)}
.acp-kpi span{display:block;font-size:.76rem;color:var(--cor-texto-suave);text-transform:uppercase;letter-spacing:.03em}
.acp-kpi b{font-size:1.6rem;line-height:1.15}
.acp-kpi.prim{border-color:var(--cor-primaria)} .acp-kpi.prim b{color:var(--cor-primaria)}
.acp-kpi.alerta b{color:#b45309} .acp-kpi.aviso b{color:#b91c1c}
.acp-colunas{display:grid;grid-template-columns:minmax(280px,360px) 1fr;gap:14px;align-items:start}
.acp-principal{display:flex;flex-direction:column;gap:12px;min-width:0}
.acp-card{border:1px solid var(--cor-borda);border-radius:16px;background:var(--cor-fundo-card);padding:14px 16px}
.acp-card-tit{display:flex;align-items:center;gap:10px;font-weight:600;margin-bottom:10px}
.acp-vazio{color:var(--cor-texto-suave);text-align:center;padding:26px}
.acp-tecs{position:sticky;top:12px;max-height:calc(100vh - 40px);overflow:auto}
.acp-tecs ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.acp-tec{display:grid;grid-template-columns:1fr auto;gap:2px 8px;padding:8px 6px;border-bottom:1px solid var(--cor-borda);border-radius:8px}
.acp-tec:last-child{border-bottom:0}
.acp-tec.on{background:color-mix(in srgb,var(--cor-primaria) 10%,transparent)}
.acp-tec-nome{all:unset;cursor:pointer;display:flex;flex-wrap:wrap;align-items:center;gap:2px 7px;min-width:0}
.acp-tec-nome .acp-suave{width:100%;padding-left:15px;font-size:.76rem}
.acp-tec-num{display:flex;gap:4px;align-items:flex-start}
.acp-fones{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:4px 10px;padding-left:15px;font-size:.82rem}
.acp-fones a{color:var(--cor-primaria);text-decoration:none;font-variant-numeric:tabular-nums}
.acp-fones a.acp-wa{color:#15803d;font-size:.76rem}
.acp-fone{display:inline-flex;align-items:center;gap:6px}
.acp-copiar{border:1px solid var(--cor-borda);background:var(--cor-fundo);color:var(--cor-texto-suave);border-radius:999px;padding:1px 8px;font:inherit;font-size:.72rem;cursor:pointer}
.acp-copiar:hover{border-color:var(--cor-primaria);color:var(--cor-primaria)}
.acp-copiar.ok{border-color:#15803d;color:#15803d}
.acp-copiar-todos{margin-left:auto;font-size:.76rem;padding:3px 10px;font-weight:600}
.acp-pill{display:inline-block;min-width:22px;text-align:center;padding:1px 7px;border-radius:999px;font-size:.76rem;font-weight:700;background:color-mix(in srgb,var(--cor-primaria) 14%,transparent);color:var(--cor-primaria)}
.acp-pill.re{background:#fee2e2;color:#b91c1c}
.acp-ponto{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--cor-borda);flex:none}
.acp-ponto.campo{background:#d97706} .acp-ponto.agenda{background:var(--cor-primaria)}
.acp-legenda{display:flex;gap:12px;margin-top:8px;font-size:.76rem;color:var(--cor-texto-suave)}
.acp-legenda i{margin-right:4px}
.acp-limpar{border:0;background:var(--cor-fundo-elevado,#eee);color:var(--cor-texto-suave);border-radius:999px;padding:2px 10px;font:inherit;font-size:.78rem;cursor:pointer}
.acp-abas{display:flex;gap:6px;flex-wrap:wrap}
.acp-abas button{border:1px solid var(--cor-borda);background:var(--cor-fundo-card);color:var(--cor-texto);border-radius:999px;padding:7px 16px;font:inherit;cursor:pointer}
.acp-abas button.on{background:var(--cor-primaria);border-color:var(--cor-primaria);color:#fff}
.acp-abas b{margin-left:4px}
.acp-tab-wrap{overflow-x:auto}
.acp-tab{width:100%;border-collapse:collapse;font-size:.85rem}
.acp-tab th{text-align:left;font-size:.74rem;text-transform:uppercase;letter-spacing:.03em;color:var(--cor-texto-suave);padding:6px 8px;border-bottom:1px solid var(--cor-borda);white-space:nowrap}
.acp-tab td{padding:7px 8px;border-bottom:1px solid var(--cor-borda);vertical-align:top}
.acp-tab tr:last-child td{border-bottom:0}
.acp-tab a{color:var(--cor-primaria);font-weight:600;text-decoration:none}
.acp-hora{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.acp-assunto{max-width:200px}
.acp-obs-cel{min-width:240px;max-width:420px}
.acp-motivo{min-width:220px;max-width:420px}
.acp-msg{font-size:.8rem;margin-top:3px;color:var(--cor-texto)}
.acp-obs{display:inline-block;margin:0 4px 3px 0;padding:2px 8px;border-radius:999px;font-size:.74rem;font-weight:600;cursor:help;background:var(--cor-fundo-elevado,#eee)}
.acp-obs.hora{background:#dbeafe;color:#1d4ed8} .acp-obs.contato{background:#dcfce7;color:#15803d}
.acp-obs.alerta{background:#fee2e2;color:#b91c1c} .acp-obs.local{background:#fef3c7;color:#92400e}
html[data-tema="dark"] .acp-obs.hora{background:#1e3a8a;color:#bfdbfe} html[data-tema="dark"] .acp-obs.contato{background:#14532d;color:#bbf7d0}
html[data-tema="dark"] .acp-obs.alerta{background:#7f1d1d;color:#fecaca} html[data-tema="dark"] .acp-obs.local{background:#78350f;color:#fde68a}
html[data-tema="dark"] .acp-pill.re{background:#7f1d1d;color:#fecaca}
.acp-modal-obs{margin:10px 0}
.acp-status{display:inline-block;padding:2px 9px;border-radius:999px;font-size:.74rem;background:var(--cor-fundo-elevado,#eee);color:var(--cor-texto-suave);white-space:nowrap}
.acp-st-agendada{background:color-mix(in srgb,var(--cor-primaria) 14%,transparent);color:var(--cor-primaria)}
.acp-st-deslocamento,.acp-st-execucao{background:color-mix(in srgb,#D97706 16%,transparent);color:#B45309}
.acp-st-aguardando-agendamento{background:#fee2e2;color:#b91c1c}
.acp-form fieldset{border:1px solid var(--cor-borda);border-radius:12px;padding:12px;margin:0 0 12px}
.acp-form label{display:grid;gap:4px;font-size:.78rem;color:var(--cor-texto-suave);margin-bottom:8px}
.acp-form input,.acp-form textarea{font:inherit;font-size:.86rem;color:var(--cor-texto);background:var(--cor-fundo);border:1px solid var(--cor-borda);border-radius:10px;padding:7px 10px;width:100%;box-sizing:border-box}
.acp-form textarea{font-family:ui-monospace,Consolas,monospace;font-size:.8rem;line-height:1.5}
.acp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.acp-acoes-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
@media (max-width:980px){.acp-colunas{grid-template-columns:1fr}.acp-tecs{position:static;max-height:none}}
@media (max-width:700px){.acp-grid{grid-template-columns:1fr}}`;
        document.head.appendChild(s);
    }

    window.renderizarAcompanhamentoCop = renderizar;
})();

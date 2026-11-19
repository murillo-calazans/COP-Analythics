// Tela de TV só com a timeline do dia (timeline.html): passa por cidade, letras
// grandes e só recarrega quando o robô grava algo novo (consultas pequenas, egress baixo).

function ixcDataBR(s) {
    const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    return m && m[3] !== "0000"
        ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
        : null;
}

function hojeMeiaNoite() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

function escaparHtml(texto) {
    return String(texto ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Só as OS agendadas para hoje (o campo AGENDAMENTO se repete em todas as linhas
// da OS), em vez das ~30 mil linhas de os_pendentes: é o que vira "prevista".
async function buscarOsPendentesHoje() {
    const d = hojeMeiaNoite();
    const prefixo = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}%`;
    const linhas = [];
    let ultimo = -1;
    while (true) {
        const { data, error } = await supabaseClient
            .from("os_pendentes").select("id, dados, capturado_em")
            .like("dados->>AGENDAMENTO", prefixo)
            .gt("id", ultimo).order("id").limit(1000);
        if (error) throw error;
        if (!data || !data.length) break;
        linhas.push(...data);
        ultimo = data[data.length - 1].id;
        if (data.length < 1000) break;
    }
    return linhas;
}

let _tltvOs = null;
async function buscarOsPendentesCacheado() {
    if (!_tltvOs) _tltvOs = buscarOsPendentesHoje().catch(e => { _tltvOs = null; throw e; });
    return _tltvOs;
}
function invalidarCacheOsPendentes() { _tltvOs = null; }

async function carregarEscalaTecnicos() {
    const { data, error } = await supabaseClient
        .from("escala_tecnicos_dados").select("dados").eq("id", "default").maybeSingle();
    if (error) throw error;
    return Array.isArray(data?.dados) ? data.dados : [];
}

const TLTV = (() => {
    const SLIDE_MS = 40 * 1000;
    const CHECAGEM_MS = 2 * 60 * 1000;
    const CHAVE_ZOOM = "tltv.zoom", CHAVE_TEMA = "tltv.tema";

    let cidadeIx = 0, pausado = false, zoom = 1.25;
    let slideTimer = null, rolarTimer = null, checarTimer = null, relogioTimer = null;
    let marcaOrdens = null, marcaOs = null, diaCarregado = null;

    const $ = id => document.getElementById(id);
    const hora = d => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    // cidades que entram sempre na tela de outra (atendidas pela mesma equipe)
    const GRUPOS_FIXOS = [
        { titulo: "Cachoeiras de Macacu", cidades: ["cachoeiras de macacu", "itaborai"] },
        { titulo: "Guapimirim", cidades: ["guapimirim", "mage"] },
        { titulo: "Rio das Ostras", cidades: ["rio das ostras", "casimiro de abreu", "macae"] },
        { titulo: "São Paulo", cidades: ["queluz", "lavrinhas", "guaratingueta", "cruzeiro"] }
    ];
    // cidade com menos técnicos que isso divide a tela com outras pequenas, até MAX_LINHAS_TELA
    const CIDADE_PEQUENA = 5, MAX_LINHAS_TELA = 8;
    const normCidade = c => String(c || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
    const grupoFixo = c => GRUPOS_FIXOS.find(g => g.cidades.includes(normCidade(c)));
    // nome que a cidade leva no resumo (as dos grupos fixos somam no grupo)
    const cidadeDoResumo = c => grupoFixo(c)?.titulo || c;

    function cidades() {
        if (!tlDados) return [];
        return tlDados.cidades.filter(c => tlDados.linhasTec.some(lt => lt.cidade === c));
    }

    // giro: 1ª tela é o resumo do dia; depois os grupos fixos, as cidades grandes
    // sozinhas e as pequenas juntas (nome de cada cidade em cima dos seus técnicos)
    const RESUMO = { titulo: "Resumo do dia", resumo: true };
    function slides() {
        const lista = cidades();
        const linhas = c => tlDados.linhasTec.filter(lt => lt.cidade === c).length;
        const telas = [];
        for (const g of GRUPOS_FIXOS) {
            const membros = g.cidades.map(n => lista.find(c => normCidade(c) === n)).filter(Boolean);
            if (membros.length) telas.push({ titulo: g.titulo, cidades: membros, ordem: membros[0] });
        }
        let pacote = null;
        for (const c of lista) {
            if (grupoFixo(c)) continue;
            const n = linhas(c);
            if (n >= CIDADE_PEQUENA) { telas.push({ titulo: c, cidades: [c], ordem: c }); continue; }
            if (pacote && pacote.n + n <= MAX_LINHAS_TELA) { pacote.cidades.push(c); pacote.n += n; continue; }
            pacote = { cidades: [c], n, ordem: c };
            telas.push(pacote);
        }
        telas.forEach(t => { if (!t.titulo) t.titulo = t.cidades.join(" · "); });
        telas.sort((a, b) => a.ordem.localeCompare(b.ordem, "pt-BR"));
        return [RESUMO, ...telas];
    }

    function mostrarCidade() {
        const lista = slides();
        cidadeIx = ((cidadeIx % lista.length) + lista.length) % lista.length;
        const ehResumo = cidadeIx === 0;
        $("agendaTimelineConteudo").hidden = ehResumo;
        $("tltvResumo").hidden = !ehResumo;
        $("tltvContador").textContent = lista.length > 1 ? `${cidadeIx + 1} de ${lista.length}` : "";
        if (ehResumo) {
            clearInterval(rolarTimer);
            $("tltvCidade").textContent = RESUMO.titulo;
            $("tltvPerf").textContent = "";
            $("tltvResumo").innerHTML = tlResumoDiaHtml(tlDados, cidadeDoResumo);
            montarDots(lista);
            return;
        }
        const tela = lista[cidadeIx];
        tlGrupo = tela.cidades;
        tlCidade = tela.cidades[0];
        tlRender();
        $("tltvCidade").textContent = tela.titulo;
        const ok = $("tlOk")?.textContent || "0", bad = $("tlBad")?.textContent || "0";
        $("tltvPerf").innerHTML = `<span class="ok">✔ ${ok} no tempo</span><span class="bad">▲ ${bad} passaram</span>`;
        montarDots(lista);
        rolarDevagar();
    }

    // cidade com mais técnicos do que cabe na tela: desce a lista aos poucos
    // durante o tempo dela e volta pro topo na próxima
    function rolarDevagar() {
        clearInterval(rolarTimer);
        const board = $("tlBoard");
        if (!board) return;
        board.scrollTop = 0;
        const sobra = board.scrollHeight - board.clientHeight;
        if (sobra <= 4) return;
        const inicio = Date.now(), espera = 4000, dur = SLIDE_MS - 8000;
        rolarTimer = setInterval(() => {
            const t = Math.min(1, Math.max(0, (Date.now() - inicio - espera) / dur));
            board.scrollTop = sobra * t;
            if (t >= 1) clearInterval(rolarTimer);
        }, 100);
    }

    function montarDots(lista) {
        const box = $("tltvDots");
        box.innerHTML = lista.map((c, i) =>
            `<button type="button" class="tltv-dot${i === cidadeIx ? " ativo" : ""}" title="${escaparHtml(c.titulo)}" data-i="${i}"></button>`).join("");
        box.querySelectorAll("[data-i]").forEach(b => b.addEventListener("click", () => irPara(+b.dataset.i)));
    }

    function irPara(i) {
        cidadeIx = i;
        mostrarCidade();
        reiniciarGiro();
    }

    function reiniciarGiro() {
        clearInterval(slideTimer);
        if (!pausado) slideTimer = setInterval(() => { cidadeIx++; mostrarCidade(); }, SLIDE_MS);
    }

    function alternarGiro() {
        pausado = !pausado;
        $("tltvGira").textContent = pausado ? "▶ Girar cidades" : "⏸ Parar nesta cidade";
        $("tltvGira").classList.toggle("parado", pausado);
        reiniciarGiro();
    }

    function aplicarZoom() {
        $("agendaTimelineConteudo").style.zoom = zoom;
        $("tltvResumo").style.zoom = zoom;
        $("tltvZoomVal").textContent = Math.round(zoom * 100) + "%";
        try { localStorage.setItem(CHAVE_ZOOM, String(zoom)); } catch {}
        if (tlDados && !$("agendaTimelineConteudo").hidden) { tlDesenharGrade(); tlTick(); rolarDevagar(); }
    }

    function mudarZoom(delta) {
        zoom = Math.min(2.2, Math.max(0.7, Math.round((zoom + delta) * 100) / 100));
        aplicarZoom();
    }

    function aplicarTema(tema) {
        document.documentElement.dataset.tema = tema;
        $("tltvTema").textContent = tema === "dark" ? "☀ Claro" : "🌙 Escuro";
        try { localStorage.setItem(CHAVE_TEMA, tema); } catch {}
    }

    async function maiorValor(tabela, coluna) {
        const { data, error } = await supabaseClient.from(tabela).select(coluna).order(coluna, { ascending: false }).limit(1);
        if (error) throw error;
        return data && data[0] ? data[0][coluna] : null;
    }

    // a cada 2 min confere só 2 carimbos (1 linha cada); recarrega a timeline
    // inteira apenas se o robô gravou algo novo ou se virou o dia
    async function checarNovidade(forcar = false) {
        try {
            const [ordens, os] = await Promise.all([maiorValor("ordens", "atualizado_em"), maiorValor("os_pendentes", "capturado_em")]);
            const dia = hojeMeiaNoite().getTime();
            const mudou = forcar || ordens !== marcaOrdens || os !== marcaOs || dia !== diaCarregado;
            if (mudou) {
                await carregarTimelineAgenda(true, true);
                marcaOrdens = ordens; marcaOs = os; diaCarregado = dia;
                mostrarCidade();
            }
            const aviso = typeof tlAvisoFonte === "function" ? tlAvisoFonte() : null;
            $("tltvErro").hidden = !aviso;
            if (aviso) $("tltvErro").textContent = aviso;
            $("tltvAtualizado").textContent = `dados de ${tlEm ? hora(new Date(tlEm)) : "—"} · conferido ${hora(new Date())}`;
        } catch (e) {
            console.warn("Timeline TV:", e);
            $("tltvErro").hidden = false;
            $("tltvErro").textContent = e?.mostrar || (/quota|restricted|402/i.test(e?.message || "")
                ? "Banco de dados bloqueado (cota do Supabase) — mostrando o último retrato."
                : "Sem conexão com o banco — tentando de novo…");
        }
    }

    function relogio() {
        const d = new Date();
        $("tltvRelogio").textContent = hora(d);
        $("tltvData").textContent = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
    }

    async function iniciar() {
        $("tltvLogin").hidden = true;
        $("tltvPainel").hidden = false;
        relogio();
        relogioTimer = setInterval(relogio, 20000);
        aplicarZoom();
        tlRegistrarCss();
        tlResumoRegistrarCss();
        $("agendaTimelineConteudo").innerHTML = `<div class="tl-vazio">Montando a timeline do dia…</div>`;
        await checarNovidade(true);
        reiniciarGiro();
        checarTimer = setInterval(checarNovidade, CHECAGEM_MS);
    }

    async function entrar(email, senha) {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
        if (error) {
            $("tltvLoginErro").textContent = error.message?.includes("Invalid login") ? "E-mail ou senha incorretos." : error.message;
            $("tltvLoginErro").hidden = false;
            return;
        }
        iniciar();
    }

    async function init() {
        try { zoom = Number(localStorage.getItem(CHAVE_ZOOM)) || zoom; } catch {}
        let tema = "dark";
        try { tema = localStorage.getItem(CHAVE_TEMA) || tema; } catch {}
        aplicarTema(tema);

        $("tltvLoginForm").addEventListener("submit", e => {
            e.preventDefault();
            entrar($("tltvEmail").value.trim().toLowerCase(), $("tltvSenha").value);
        });
        $("tltvGira").addEventListener("click", alternarGiro);
        $("tltvZoomMais").addEventListener("click", () => mudarZoom(0.1));
        $("tltvZoomMenos").addEventListener("click", () => mudarZoom(-0.1));
        $("tltvTema").addEventListener("click", () => aplicarTema(document.documentElement.dataset.tema === "dark" ? "light" : "dark"));
        $("tltvFull").addEventListener("click", () => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen?.();
        });
        $("tltvSair").addEventListener("click", async () => {
            await supabaseClient.auth.signOut();
            location.reload();
        });
        document.addEventListener("keydown", e => {
            if (e.target.tagName === "INPUT") return;
            if (e.key === "ArrowRight") irPara(cidadeIx + 1);
            else if (e.key === "ArrowLeft") irPara(cidadeIx - 1);
            else if (e.key === " ") { e.preventDefault(); alternarGiro(); }
            else if (e.key === "+" || e.key === "=") mudarZoom(0.1);
            else if (e.key === "-" || e.key === "_") mudarZoom(-0.1);
        });

        const { data } = await supabaseClient.auth.getSession();
        if (data?.session) iniciar();
        else $("tltvLogin").hidden = false;
    }

    return { init };
})();

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", TLTV.init);
else TLTV.init();

const LIMITE_LINHAS_CLIENTES_CTO = 200;

let _clientesCtoFiltro = "todos";
let _clientesCtoToken = 0;
let _clientesCtoBuscaTimer = null;

let _clientesCtoTemCliente = true;
let _clientesCtoTemLacre = true;

let _clientesCtoTemAtivo = true;

function erroFaltaPatch25(erro) {
    return /clientes_cto/.test(erro?.message ?? "") || erro?.code === "42P01" || erro?.code === "PGRST205";
}

function aplicarFiltroCardClientesCto(consulta, filtro) {
    if (filtro === "inativoCadastrado") return consulta.eq("ativo", false).eq("completo", true);
    if (_clientesCtoTemAtivo) consulta = consulta.eq("ativo", true);
    if (filtro === "completo") return consulta.eq("completo", true);
    if (filtro === "incompleto") return consulta.eq("completo", false);
    if (filtro === "semLacre") return consulta.is("lacre", null);
    if (filtro === "semCliente") return consulta.is("cliente", null);
    return consulta;
}

function termoBuscaClientesCto() {
    return (document.getElementById("buscaClientesCto")?.value ?? "").replace(/[,()*%"\\]/g, " ").trim();
}

async function contarClientesCto(filtro) {
    const { count, error } = await aplicarFiltroCardClientesCto(
        supabaseClient.from("clientes_cto").select("chave", { count: "exact", head: true }), filtro);
    if (error) throw error;
    return count ?? 0;
}

async function renderizarClientesCto() {
    registrarClientesCto();
    const token = ++_clientesCtoToken;
    const cards = document.getElementById("cardsClientesCto");
    const lista = document.getElementById("listaClientesCto");
    if (!cards || !lista) return;

    try {

        const teste = await supabaseClient.from("clientes_cto").select("ativo").limit(1);
        _clientesCtoTemAtivo = !teste.error;
        if (!_clientesCtoTemAtivo && _clientesCtoFiltro === "inativoCadastrado") _clientesCtoFiltro = "todos";

        const [total, completos, semLacre, semCliente, inativosCadastrados, ultima] = await Promise.all([
            contarClientesCto("todos"),
            contarClientesCto("completo"),
            contarClientesCto("semLacre"),
            contarClientesCto("semCliente"),
            _clientesCtoTemAtivo ? contarClientesCto("inativoCadastrado") : Promise.resolve(0),
            supabaseClient.from("clientes_cto").select("sincronizado_em").order("sincronizado_em", { ascending: false }).limit(1)
        ]);
        if (token !== _clientesCtoToken) return;
        if (ultima.error) throw ultima.error;

        if (total === 0) {
            cards.innerHTML = "";
            document.getElementById("atualizacaoClientesCto").textContent = "";
            lista.innerHTML = '<p class="alerta-vazio">A base de clientes ainda não chegou do IXC — o robô grava aqui quando a visão de clientes x CTO estiver configurada (1x por dia).</p>';
            return;
        }

        _clientesCtoTemLacre = semLacre < total;
        _clientesCtoTemCliente = semCliente < total;
        if (!_clientesCtoTemLacre && _clientesCtoFiltro === "semLacre") _clientesCtoFiltro = "todos";
        renderizarCardsClientesCto({ total, completos, semLacre, inativosCadastrados });
        const quando = ultima.data?.[0]?.sincronizado_em;
        document.getElementById("atualizacaoClientesCto").textContent =
            quando ? `Base do IXC atualizada em ${new Date(quando).toLocaleString("pt-BR")}.` : "";
    } catch (erro) {
        if (token !== _clientesCtoToken) return;
        console.error("Cadastro na CTO:", erro);
        cards.innerHTML = "";
        lista.innerHTML = erroFaltaPatch25(erro)
            ? '<p class="alerta-vazio">A tabela da base de clientes ainda não existe no banco — falta rodar o database/patch-25-clientes-cto.sql no Supabase.</p>'
            : `<p class="alerta-vazio">Não deu pra carregar: ${escaparHtml(erro?.message ?? String(erro))}</p>`;
        return;
    }

    await buscarListaClientesCto(token);
}

function renderizarCardsClientesCto({ total, completos, semLacre, inativosCadastrados }) {
    const fmt = n => n.toLocaleString("pt-BR");
    const pct = n => total ? `${Math.round((n / total) * 100)}%` : "0%";
    const card = (id, rotulo, valor, detalhe, classe) => `
        <button type="button" class="stat-tile stat-tile-link clientes-cto-card ${classe}${_clientesCtoFiltro === id ? " ativo" : ""}" data-filtro-clientes-cto="${id}">
            <div class="stat-label">${rotulo}</div>
            <div class="stat-valor">${fmt(valor)}</div>
            <div class="clientes-cto-detalhe">${detalhe}</div>
        </button>`;

    const cards = document.getElementById("cardsClientesCto");

    cards.innerHTML =
        (inativosCadastrados > 0
            ? card("inativoCadastrado", "⚠ Inativos ainda cadastrados na CTO", inativosCadastrados,
                "login inativo ocupando porta — liberar no IXC", "stat-tile-destaque cto-alerta")
            : "") +
        card("completo", "Com CTO e porta cadastrados", completos, `${pct(completos)} da base`, "cto-ok") +
        card("incompleto", "Sem cadastro de CTO/porta", total - completos, `${pct(total - completos)} da base`, "cto-falta") +
        (_clientesCtoTemLacre ? card("semLacre", "Sem lacre cadastrado", semLacre, `${pct(semLacre)} da base`, "cto-lacre") : "") +
        card("todos", "Logins ativos na base", total, "clique pra ver todos", "");

    cards.querySelectorAll("[data-filtro-clientes-cto]").forEach(botao => {
        botao.addEventListener("click", () => {
            const id = botao.dataset.filtroClientesCto;
            _clientesCtoFiltro = _clientesCtoFiltro === id ? "todos" : id;
            cards.querySelectorAll("[data-filtro-clientes-cto]").forEach(b =>
                b.classList.toggle("ativo", b.dataset.filtroClientesCto === _clientesCtoFiltro));
            buscarListaClientesCto(++_clientesCtoToken);
        });
    });
}

async function buscarListaClientesCto(token) {
    const lista = document.getElementById("listaClientesCto");
    const resumo = document.getElementById("resumoClientesCto");
    if (!lista) return;

    const termo = termoBuscaClientesCto();
    let consulta = aplicarFiltroCardClientesCto(
        supabaseClient.from("clientes_cto").select("cliente, login, cto, porta, lacre, completo", { count: "exact" }),
        _clientesCtoFiltro);
    if (termo) {
        const like = `"*${termo}*"`;
        consulta = consulta.or(`cliente.ilike.${like},login.ilike.${like},cto.ilike.${like},lacre.ilike.${like}`);
    }
    const { data, count, error } = await consulta.order("login", { ascending: true }).limit(LIMITE_LINHAS_CLIENTES_CTO);
    if (token !== _clientesCtoToken) return;
    if (error) {
        lista.innerHTML = `<p class="alerta-vazio">Não deu pra buscar: ${escaparHtml(error.message)}</p>`;
        return;
    }

    const total = count ?? data.length;
    if (resumo) {
        resumo.textContent = total > data.length
            ? `${total.toLocaleString("pt-BR")} logins batem — mostrando os ${data.length} primeiros (busque pela CTO ou pelo login pra achar um).`
            : `${total.toLocaleString("pt-BR")} login(s).`;
    }

    if (data.length === 0) {
        lista.innerHTML = '<p class="alerta-vazio">Nenhum cliente encontrado.</p>';
        return;
    }

    const comCliente = _clientesCtoTemCliente, comLacre = _clientesCtoTemLacre;
    const alerta = _clientesCtoFiltro === "inativoCadastrado";
    const celula = valor => valor ? escaparHtml(valor) : '<span class="clientes-cto-vazio">—</span>';
    lista.innerHTML = `
        <div class="tabela-scroll">
            <table class="tabela-alertas">
                <thead>
                    <tr>${comCliente ? "<th class=\"cc-cliente\">Cliente</th>" : ""}<th class="cc-login">Login</th><th class="cc-cto">CTO</th><th class="cc-porta">Porta</th>${comLacre ? "<th class=\"cc-lacre\">Lacre</th>" : ""}<th class="cc-falta">${alerta ? "Situação" : "Falta cadastrar"}</th></tr>
                </thead>
                <tbody>
                    ${data.map(c => {
                        const falta = alerta ? [] : [!c.cto && "CTO", !c.porta && "Porta", comLacre && !c.lacre && "Lacre"].filter(Boolean);
                        if (alerta) return `
                        <tr>
                            ${comCliente ? `<td class="ctos-texto" title="${escaparHtml(c.cliente ?? "")}">${celula(c.cliente)}</td>` : ""}
                            <td>${celula(c.login)}</td>
                            <td>${celula(c.cto)}</td>
                            <td>${celula(c.porta)}</td>
                            ${comLacre ? `<td>${celula(c.lacre)}</td>` : ""}
                            <td><span class="ctos-status pendente">Inativo · liberar porta</span></td>
                        </tr>`;
                        return `
                        <tr>
                            ${comCliente ? `<td class="ctos-texto" title="${escaparHtml(c.cliente ?? "")}">${celula(c.cliente)}</td>` : ""}
                            <td>${celula(c.login)}</td>
                            <td>${celula(c.cto)}</td>
                            <td>${celula(c.porta)}</td>
                            ${comLacre ? `<td>${celula(c.lacre)}</td>` : ""}
                            <td>${falta.length
                                ? falta.map(f => `<span class="ctos-status pendente">${f}</span>`).join(" ")
                                : '<span class="ctos-status cadastrado">Completo</span>'}</td>
                        </tr>`;
                    }).join("")}
                </tbody>
            </table>
        </div>`;
}

let _clientesCtoRegistrado = false;

function registrarClientesCto() {
    if (_clientesCtoRegistrado) return;
    _clientesCtoRegistrado = true;

    document.getElementById("buscaClientesCto")?.addEventListener("input", () => {
        clearTimeout(_clientesCtoBuscaTimer);
        _clientesCtoBuscaTimer = setTimeout(() => buscarListaClientesCto(++_clientesCtoToken), 350);
    });
}

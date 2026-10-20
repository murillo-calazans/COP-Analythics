/**
 * ==========================================================
 * UI de Endereços a corrigir (módulo Gestão de Clientes)
 * ==========================================================
 * Logins cujo endereço no IXC não bate com o GPS das OS (ver
 * js/engine/enderecoengine.js e js/config/enderecos.js), pra corrigir o
 * cadastro no IXC. Recorte do Filtro Global, igual às outras abas.
 *
 * Cards filtram a lista (todos / confiança alta / fora da área); busca
 * por cliente, login ou cidade; "Baixar planilha" leva a lista inteira
 * (sem o filtro do card) pra quem vai corrigir no IXC.
 */

let _enderecosFiltro = "todos"; // todos | alta | foraDaArea
let _enderecosResultado = null;
let _enderecosRegistrado = false;

function registrarEnderecos() {
    if (_enderecosRegistrado) return;
    _enderecosRegistrado = true;
    document.getElementById("buscaEnderecos")?.addEventListener("input", desenharListaEnderecos);
    document.getElementById("btnBaixarEnderecos")?.addEventListener("click", baixarPlanilhaEnderecos);
}

function renderizarEnderecos() {
    registrarEnderecos();
    const cards = document.getElementById("cardsEnderecos");
    const lista = document.getElementById("listaEnderecos");
    if (!cards || !lista) return;

    const ordens = FiltroEngine.ordensFiltradas();
    if (!ordens || ordens.size === 0) {
        cards.innerHTML = "";
        lista.innerHTML = '<p class="alerta-vazio">Nenhuma OS no recorte do Filtro Global.</p>';
        return;
    }

    _enderecosResultado = EnderecoEngine.calcular(ordens);
    const r = _enderecosResultado.resumo;
    const fmt = n => n.toLocaleString("pt-BR");
    const card = (id, rotulo, valor, detalhe, classe) => `
        <button type="button" class="stat-tile stat-tile-link clientes-cto-card ${classe}${_enderecosFiltro === id ? " ativo" : ""}" data-filtro-enderecos="${id}">
            <div class="stat-label">${rotulo}</div>
            <div class="stat-valor">${fmt(valor)}</div>
            <div class="clientes-cto-detalhe">${detalhe}</div>
        </button>`;
    cards.innerHTML =
        card("todos", "Logins com endereço a corrigir", r.logins, `${fmt(r.osAfetadas)} OS afetadas`, "stat-tile-destaque cto-alerta") +
        card("alta", "Confiança alta", r.confiancaAlta, "2 ou mais OS apontam a mesma cidade", "cto-falta") +
        card("foraDaArea", "Cidade fora da área", r.foraDaArea, CONFIG_ENDERECOS.cidadesSempreAlerta.join(", "), "cto-lacre") +
        `<div class="stat-tile clientes-cto-card cto-ok">
            <div class="stat-label">Já corrigidos no IXC</div>
            <div class="stat-valor">${fmt(r.jaCorrigidos)}</div>
            <div class="clientes-cto-detalhe">a OS mais recente já bate com o GPS</div>
        </div>`;

    cards.querySelectorAll("[data-filtro-enderecos]").forEach(botao => {
        botao.addEventListener("click", () => {
            const id = botao.dataset.filtroEnderecos;
            _enderecosFiltro = _enderecosFiltro === id && id !== "todos" ? "todos" : id;
            cards.querySelectorAll("[data-filtro-enderecos]").forEach(b =>
                b.classList.toggle("ativo", b.dataset.filtroEnderecos === _enderecosFiltro));
            desenharListaEnderecos();
        });
    });

    desenharListaEnderecos();
}

function enderecosVisiveis() {
    if (!_enderecosResultado) return [];
    const termo = normalizarTexto(document.getElementById("buscaEnderecos")?.value ?? "").trim();
    return _enderecosResultado.logins.filter(l => {
        if (_enderecosFiltro === "alta" && l.confianca !== "alta") return false;
        if (_enderecosFiltro === "foraDaArea" && !l.foraDaArea) return false;
        if (!termo) return true;
        return [l.cliente, l.login, l.cidadeCadastrada, l.bairroCadastrado, l.cidadeProvavel]
            .some(v => normalizarTexto(v ?? "").includes(termo));
    });
}

const ROTULO_CONFIANCA_ENDERECO = {
    alta: '<span class="ctos-status pendente">Alta</span>',
    media: '<span class="ctos-status">Média</span>',
    "sem-gps": '<span class="ctos-status">Sem GPS</span>'
};

function desenharListaEnderecos() {
    const lista = document.getElementById("listaEnderecos");
    const resumo = document.getElementById("resumoEnderecos");
    if (!lista || !_enderecosResultado) return;

    const itens = enderecosVisiveis();
    if (resumo) resumo.textContent = `${itens.length.toLocaleString("pt-BR")} login(s). Corrija o endereço no cadastro do cliente no IXC; quando a próxima OS vier com a cidade certa, o login sai daqui sozinho.`;
    if (itens.length === 0) {
        lista.innerHTML = '<p class="alerta-vazio">Nenhum endereço a corrigir neste recorte.</p>';
        return;
    }

    const vazio = '<span class="clientes-cto-vazio">—</span>';
    const celula = v => v ? escaparHtml(String(v)) : vazio;
    lista.innerHTML = `
        <div class="tabela-scroll">
            <table class="tabela-alertas">
                <thead>
                    <tr><th>Cliente</th><th>Login</th><th>Cadastrado no IXC</th><th>Cidade pelo GPS</th><th>Distância</th><th>OS</th><th>Última OS</th><th>Motivo</th><th>Confiança</th><th>Mapa</th></tr>
                </thead>
                <tbody>
                    ${itens.map(l => `
                    <tr>
                        <td class="ctos-texto" title="${escaparHtml(l.cliente ?? "")}">${celula(l.cliente)}</td>
                        <td>${celula(l.login)}</td>
                        <td>${celula(l.cidadeCadastrada)}${l.bairroCadastrado ? `<br><small>${escaparHtml(l.bairroCadastrado)}</small>` : ""}</td>
                        <td><strong>${celula(l.cidadeProvavel)}</strong></td>
                        <td>${l.distanciaKm != null ? `${Math.round(l.distanciaKm)} km` : vazio}</td>
                        <td title="OS com o endereço suspeito: ${escaparHtml(l.idsOS.join(", "))}">${l.qtdSuspeitas}${l.qtdOS > l.qtdSuspeitas ? ` de ${l.qtdOS}` : ""}</td>
                        <td>${escaparHtml(String(l.ultimaOS.id))}<br><small>${l.ultimaOS.data ? l.ultimaOS.data.toLocaleDateString("pt-BR") : ""} · ${escaparHtml(l.ultimaOS.assunto ?? "")}</small></td>
                        <td>${escaparHtml(l.motivo)}</td>
                        <td>${ROTULO_CONFIANCA_ENDERECO[l.confianca]}</td>
                        <td>${l.lat != null ? `<a href="https://www.google.com/maps?q=${l.lat},${l.lng}" target="_blank" rel="noopener">Ver no mapa</a>` : vazio}</td>
                    </tr>`).join("")}
                </tbody>
            </table>
        </div>`;
}

function baixarPlanilhaEnderecos() {
    if (!_enderecosResultado) return;
    const cabecalho = ["Cliente", "Login", "Cidade cadastrada", "Bairro cadastrado", "Cidade pelo GPS", "Distância (km)", "OS com endereço suspeito", "Total de OS do login",
        "Última OS", "Data da última OS", "Assunto da última OS", "Motivo", "Confiança", "Latitude", "Longitude", "IDs das OS"];
    const linhas = _enderecosResultado.logins.map(l => [
        l.cliente ?? "", l.login ?? "", l.cidadeCadastrada ?? "", l.bairroCadastrado ?? "", l.cidadeProvavel ?? "",
        l.distanciaKm != null ? Math.round(l.distanciaKm) : "", l.qtdSuspeitas, l.qtdOS,
        l.ultimaOS.id, l.ultimaOS.data ? formatarDataHora(l.ultimaOS.data) : "", l.ultimaOS.assunto ?? "",
        l.motivo, { alta: "Alta", media: "Média", "sem-gps": "Sem GPS" }[l.confianca], l.lat ?? "", l.lng ?? "", l.idsOS.join(", ")
    ]);
    baixarCsv(`enderecos-a-corrigir-${carimboDataHora()}.csv`, [cabecalho, ...linhas]);
}

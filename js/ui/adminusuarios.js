/**
 * ==========================================================
 * Painel de Administrador — Usuários
 * ==========================================================
 * Lista quem tem conta e deixa um admin trocar papel, nome e setor
 * ou remover o acesso, sem SQL Editor. Tudo passa pelas funções do
 * database/patch-16-admin-usuarios.sql, que conferem no banco se
 * quem chama é admin — esconder a tela aqui é só conforto.
 *
 * - nome: aparece na saudação e acha o operador nas OS (produção do
 *   mês, ver ProducaoEngine.encontrarOperador) — use o nome como está
 *   no sistema de OS;
 * - setor: vazio = vê todas as OS; preenchido = só as daquele setor
 *   (usuário de terceirizada, ver database/patch-06).
 *
 * Criar a conta (e-mail/senha) continua no Supabase; a conta nova
 * aparece aqui como "Sem acesso" até receber um papel.
 */

const PAPEIS_USUARIO = {
    admin: { rotulo: "Admin", descricao: "Tudo: importar, apagar, editar escala, pré-agendamento, usuários" },
    editor: { rotulo: "Editor", descricao: "Importa dados e vê tudo" },
    leitor: { rotulo: "Leitor", descricao: "Só consulta" }
};

let usuariosAdmin = null;     // lista vinda do banco
let buscaUsuariosAdmin = "";

async function carregarUsuariosAdmin() {
    const { data, error } = await supabaseClient.rpc("admin_listar_usuarios");
    if (error) throw error;
    usuariosAdmin = data ?? [];
    return usuariosAdmin;
}

function dataCurta(valor) {
    if (!valor) return "nunca";
    return new Date(valor).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function setoresConhecidos() {
    const setores = new Set();
    for (const linha of APP.referencias.operadores?.values?.() ?? []) {
        const coluna = encontrarColuna(linha, CONFIG_BASE.operadores.setor);
        const valor = coluna ? String(linha[coluna] ?? "").trim() : "";
        if (valor) setores.add(valor.toUpperCase());
    }
    return [...setores].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

async function renderizarAdminUsuarios(forcar = false) {
    const container = document.getElementById("adminUsuariosConteudo");
    if (!container) return;

    if (!ehAdmin()) {
        container.innerHTML = '<p class="alerta-vazio">Só administradores podem ver os usuários.</p>';
        return;
    }

    if (!usuariosAdmin || forcar) {
        container.innerHTML = '<p class="alerta-vazio">Carregando usuários...</p>';
        try {
            await carregarUsuariosAdmin();
        } catch (erro) {
            const faltaFuncao = /admin_listar_usuarios|function|PGRST202/i.test(`${erro.message} ${erro.code}`);
            container.innerHTML = faltaFuncao
                ? '<p class="alerta-vazio">As funções de usuários ainda não existem no banco — falta rodar o database/patch-16-admin-usuarios.sql no Supabase.</p>'
                : `<p class="alerta-vazio">Não deu pra carregar os usuários: ${escaparHtml(erro.message ?? String(erro))}</p>`;
            return;
        }
    }

    const termo = normalizarTexto(buscaUsuariosAdmin);
    const lista = usuariosAdmin.filter(u => !termo || normalizarTexto(`${u.nome ?? ""} ${u.email ?? ""} ${u.setor ?? ""}`).includes(termo));
    const contar = papel => usuariosAdmin.filter(u => (u.papel ?? null) === papel).length;
    const setores = setoresConhecidos();

    container.innerHTML = `
        <div class="kpi-row admin-kpis">
            <div class="stat-tile"><div class="stat-label">Admins</div><div class="stat-valor">${contar("admin")}</div></div>
            <div class="stat-tile"><div class="stat-label">Editores</div><div class="stat-valor">${contar("editor")}</div></div>
            <div class="stat-tile"><div class="stat-label">Leitores</div><div class="stat-valor">${contar("leitor")}</div></div>
            <div class="stat-tile"><div class="stat-label">Sem acesso</div><div class="stat-valor">${contar(null)}</div></div>
        </div>

        <div class="grafico-card admin-usuarios-card">
            <div class="admin-usuarios-barra">
                <input type="search" id="buscaUsuariosAdmin" class="seletor-multiplo-input" placeholder="Buscar por nome, e-mail ou setor..." value="${escaparHtml(buscaUsuariosAdmin)}">
                <span class="admin-dica">Conta nova: crie no Supabase (Authentication &gt; Users &gt; Add user) e dê o papel aqui.</span>
            </div>

            <datalist id="listaSetoresAdmin">${setores.map(s => `<option value="${escaparHtml(s)}">`).join("")}</datalist>

            <div class="tabela-scroll">
                <table class="tabela-alertas admin-usuarios">
                    <thead>
                        <tr>
                            <th>Usuário</th>
                            <th>Nome no sistema de OS</th>
                            <th>Papel</th>
                            <th>Setor <span class="admin-dica" title="Vazio = vê todas as OS. Preenchido = só as daquele setor (terceirizada).">ⓘ</span></th>
                            <th>Último acesso</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.length ? lista.map(linhaUsuarioAdmin).join("") : '<tr><td colspan="6" class="alerta-vazio">Ninguém encontrado.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const busca = document.getElementById("buscaUsuariosAdmin");
    busca?.addEventListener("input", () => {
        buscaUsuariosAdmin = busca.value;
        const posicao = busca.selectionStart;
        renderizarAdminUsuarios().then(() => {
            const nova = document.getElementById("buscaUsuariosAdmin");
            nova?.focus();
            nova?.setSelectionRange(posicao, posicao);
        });
    });

    container.querySelectorAll("tr[data-usuario]").forEach(registrarLinhaUsuarioAdmin);
}

function linhaUsuarioAdmin(u) {
    const souEu = u.id === APP.usuario?.id;
    const semAcesso = !u.papel;
    const papelAtual = u.papel ?? "leitor";

    return `
        <tr data-usuario="${escaparHtml(u.id)}" class="${semAcesso ? "admin-sem-acesso" : ""}">
            <td>
                <div class="admin-email">${escaparHtml(u.email ?? "")}${souEu ? ' <span class="admin-voce">você</span>' : ""}</div>
                ${semAcesso ? '<span class="admin-badge-sem-acesso">Sem acesso</span>' : ""}
            </td>
            <td><input type="text" data-campo="nome" value="${escaparHtml(u.nome ?? "")}" placeholder="Ex.: MURILLO CALAZANS"></td>
            <td>
                <select data-campo="papel"${souEu ? ' disabled title="Você não pode tirar o seu próprio admin"' : ""}>
                    ${Object.entries(PAPEIS_USUARIO).map(([valor, p]) =>
                        `<option value="${valor}"${valor === papelAtual ? " selected" : ""} title="${escaparHtml(p.descricao)}">${p.rotulo}</option>`).join("")}
                </select>
            </td>
            <td><input type="text" data-campo="setor" list="listaSetoresAdmin" value="${escaparHtml(u.setor ?? "")}" placeholder="Todos"></td>
            <td class="admin-ultimo-acesso">${dataCurta(u.ultimo_acesso)}</td>
            <td class="admin-acoes">
                <button type="button" class="botao-primario admin-salvar" ${semAcesso ? "" : "disabled"}>${semAcesso ? "Dar acesso" : "Salvar"}</button>
                ${!semAcesso && !souEu ? '<button type="button" class="botao-secundario admin-remover" title="Tira o acesso ao COP (a conta continua existindo)">Remover</button>' : ""}
            </td>
        </tr>`;
}

function registrarLinhaUsuarioAdmin(tr) {
    const id = tr.dataset.usuario;
    const usuario = usuariosAdmin.find(u => u.id === id);
    const campos = () => ({
        nome: tr.querySelector('[data-campo="nome"]').value,
        papel: tr.querySelector('[data-campo="papel"]').value,
        setor: tr.querySelector('[data-campo="setor"]').value
    });
    const botaoSalvar = tr.querySelector(".admin-salvar");

    // "Salvar" só acende quando algo mudou (conta sem acesso já nasce acesa).
    const atualizarBotao = () => {
        if (!usuario.papel) return;
        const c = campos();
        const mudou = c.nome.trim() !== (usuario.nome ?? "") || c.papel !== usuario.papel || c.setor.trim() !== (usuario.setor ?? "");
        botaoSalvar.disabled = !mudou;
    };
    tr.querySelectorAll("[data-campo]").forEach(campo => {
        campo.addEventListener("input", atualizarBotao);
        campo.addEventListener("change", atualizarBotao);
    });

    botaoSalvar.addEventListener("click", async () => {
        const c = campos();
        if (c.papel === "admin" && usuario.papel !== "admin"
            && !confirm(`Dar acesso de ADMIN para ${usuario.email}? Admin pode importar, apagar dados e gerenciar usuários.`)) return;

        botaoSalvar.disabled = true;
        botaoSalvar.textContent = "Salvando...";
        const { error } = await supabaseClient.rpc("admin_salvar_usuario", {
            p_id: id, p_papel: c.papel, p_nome: c.nome, p_setor: c.setor
        });
        if (error) {
            alert(`Não deu pra salvar: ${error.message}`);
            renderizarAdminUsuarios();
            return;
        }

        if (id === APP.usuario?.id) {
            APP.usuario.nome = c.nome.trim() || nomeDoEmail(APP.usuario.email);
            APP.usuario.setor = c.setor.trim() || null;
            mostrarAppAutenticado();
        }
        renderizarAdminUsuarios(true);
    });

    tr.querySelector(".admin-remover")?.addEventListener("click", async () => {
        if (!confirm(`Remover o acesso de ${usuario.email} ao COP? A conta continua existindo e dá pra devolver o acesso depois.`)) return;
        const { error } = await supabaseClient.rpc("admin_remover_acesso", { p_id: id });
        if (error) {
            alert(`Não deu pra remover: ${error.message}`);
            return;
        }
        renderizarAdminUsuarios(true);
    });
}

function registrarAdminUsuarios() {
    document.getElementById("btnAtualizarUsuarios")?.addEventListener("click", () => renderizarAdminUsuarios(true));
}

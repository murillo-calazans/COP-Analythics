const ASSUNTOS_EQUIVALENTES = [
    { de: "INSTALAÇÃO NOVO CLIENTE - TERCEIRIZADO (70)", para: "INSTALAÇÃO NOVO CLIENTE (70)" },
    { de: "TRANSFERÊNCIA DE ENDEREÇO - TERCEIRIZADA (150)", para: "TRANSFERÊNCIA DE ENDEREÇO (150)" },
    { de: "REPARO PÓS INSTALAÇÃO TERCEIRIZADA - ATÉ 15 DIAS", para: "GARANTIA TERCEIRIZADA" }

];

window.ASSUNTOS_EQUIVALENTES = ASSUNTOS_EQUIVALENTES;

// Recolhimento terceirizado (MOTO Express) não interessa ao COP e sai do sistema todo (24/11/2026):
// some das OS em aberto, agenda, agendadas, relatórios, dashboard, auditoria, terceiras, KPIs etc.
// Para tirar outro tipo / técnico / operador, acrescente aqui (compara sem acento e sem maiúsculas).
const ASSUNTOS_FORA_DO_SISTEMA = [
    /recolhimento de equipamentos?\s*-?\s*terceirizad/      // RECOLHIMENTO DE EQUIPAMENTOS - TERCEIRIZADO (199)
];
// Técnicos do recolhimento terceirizado: OS em que eles são o responsável saem inteiras.
const TECNICOS_FORA_DO_SISTEMA = [
    { id: "263", nome: /emerson alves moreira/ }             // EMERSON ALVES MOREIRA
];
// Operadores de terceiros: não contam como operador do COP (as movimentações deles saem;
// a OS continua, se não cair nas regras acima).
const OPERADORES_TERCEIROS = ["48"];                         // TAINÁ DOS SANTOS WENDEROSCK

const _normFora = t => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function osForaDoSistema(assunto) {
    const a = _normFora(assunto);
    return !!a && ASSUNTOS_FORA_DO_SISTEMA.some(r => r.test(a));
}
/** colaborador (id) ou nome (equipe/técnico) de um técnico do recolhimento terceirizado */
function tecnicoForaDoSistema(colaboradorId, nome) {
    const id = String(colaboradorId ?? "").trim(), n = _normFora(nome);
    return TECNICOS_FORA_DO_SISTEMA.some(t => (id && id === t.id) || (n && t.nome.test(n)));
}
function operadorTerceiro(operadorId) {
    return OPERADORES_TERCEIROS.includes(String(operadorId ?? "").trim());
}

window.osForaDoSistema = osForaDoSistema;
window.tecnicoForaDoSistema = tecnicoForaDoSistema;
window.operadorTerceiro = operadorTerceiro;

// ---------- Grupos de assunto das OS de campo (25/11/2026, definidos pelo COP) ----------
// Usados no filtro "Assunto" e no cartão "Por assunto" do relatório da aba Ordens e no KPI da tela inicial.
// Ordem importa: o primeiro que casar vence (compara sem acento e sem maiúsculas).
const GRUPOS_ASSUNTO_CAMPO = [
    { grupo: "Garantias",                     re: /reparo pos instalacao|garantia/ },
    { grupo: "Ordens B2B",                    re: /ultima milha|\bk2\b|ativacao b2b/ },
    { grupo: "Instalação",                    re: /^instalacao/ },
    { grupo: "Troca de equipamento",          re: /troca de equipamento/ },
    { grupo: "Migrações",                     re: /mudanca de tecnologia/ },
    { grupo: "Mudança de endereço / cômodo",  re: /transferencia de endereco|troca de comodo/ },
    { grupo: "Visitas técnicas",              re: /repetidor|reativacao|visita tecnica\s*-?\s*sva|troca de senha/ },
    { grupo: "Reparo",                        re: /sem conexao|verificar conexao|visita tecnica/ }
];
// De campo, mas não contam no relatório nem no KPI de OS de campo:
const ASSUNTOS_FORA_DO_RELATORIO_CAMPO = [
    /rompimento/,               // ordens do setor de infra
    /telefonia voip/,           // vai junto com a ordem de instalação
    /portabilidade/             // ordem interna, só o COP lida
];

function grupoDoAssunto(assunto) {
    const a = _normFora(assunto);
    return GRUPOS_ASSUNTO_CAMPO.find(g => g.re.test(a))?.grupo ?? "Outros";
}
function assuntoForaDoRelatorioCampo(assunto) {
    const a = _normFora(assunto);
    return !!a && ASSUNTOS_FORA_DO_RELATORIO_CAMPO.some(r => r.test(a));
}

window.GRUPOS_ASSUNTO_CAMPO = GRUPOS_ASSUNTO_CAMPO;
window.grupoDoAssunto = grupoDoAssunto;
window.assuntoForaDoRelatorioCampo = assuntoForaDoRelatorioCampo;

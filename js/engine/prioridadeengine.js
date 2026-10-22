/**
 * ==========================================================
 * Prioridade Engine — pedido de prioridade/urgência nas mensagens
 * ==========================================================
 * O campo PRIORIDADE do IXC quase nunca é usado (out/2026: 41 de ~19 mil
 * OS no pré-agendamento) — o pedido fica só no TEXTO das movimentações:
 * "cliente em contato pedindo urgência", "solicitado prioridade ao
 * coordenador", "precisa com urgência"... Este engine lê esse texto.
 *
 * Fica de fora o que só PARECE pedido (conferido nos dados reais):
 * - retenção nos cancelamentos: "foi ofertada visita técnica prioritária";
 * - "dado prioridade a ordem de sem conexão", "prioridade são os clientes
 *   sem conexão" (orientação interna, não pedido daquela OS);
 * - o texto copiado da OS anterior ("Processo: ... Descrição OS anterior:").
 * "Encaixado na agenda via Painel" e "cabos bem encaixados" não casam (a
 * palavra "encaixe" não entra na regra).
 */
const PrioridadeEngine = {

    PEDIDO: /(solicit|ped|precis|necessit|quer|exig|cobr)\w*[^.\/\n]{0,40}(urg[eê]n|priorid|priorit)|(urg[eê]n|priorid|priorit)\w*[^.\/\n]{0,25}(solicit|pedid|pede)|urgent[ea]|o mais r[aá]pido poss|o quanto antes|com pressa/i,

    // Perto do trecho (80 caracteres pra cada lado) = é oferta/orientação, não pedido.
    OFERTA: /ofert|oferec|proposta|disponibiliz|dado prioridade|prioridade s[aã]o/i,

    /** Trecho do pedido (até ~350 caracteres em volta) ou null. */
    trechoPedido(mensagem) {
        const texto = String(mensagem ?? "").replace(/Processo:[\s\S]*?Descrição OS anterior:/i, "");
        const achado = texto.match(this.PEDIDO);
        if (!achado) return null;
        const i = achado.index;
        if (this.OFERTA.test(texto.slice(Math.max(0, i - 80), i + 80))) return null;
        return texto.slice(Math.max(0, i - 150), i + 200).replace(/\s+/g, " ").trim();
    },

    /**
     * Pedidos de uma OS, em ordem cronológica. `eventos` = [{ data: Date, msg|mensagem: string }]
     * (formato da os_pendentes no painel/backlog ou Movimentacao do relatório de ordens).
     */
    pedidosDaOS(eventos) {
        const pedidos = [];
        for (const e of eventos ?? []) {
            const trecho = this.trechoPedido(e.msg ?? e.mensagem);
            if (trecho) pedidos.push({ data: e.data ?? null, trecho });
        }
        return pedidos.sort((a, b) => (a.data?.getTime?.() ?? 0) - (b.data?.getTime?.() ?? 0));
    }
};

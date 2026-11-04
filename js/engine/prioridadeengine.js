const PrioridadeEngine = {

    PEDIDO: /(solicit|ped|precis|necessit|quer|exig|cobr)\w*[^.\/\n]{0,40}(urg[eê]n|priorid|priorit)|(urg[eê]n|priorid|priorit)\w*[^.\/\n]{0,25}(solicit|pedid|pede)|urgent[ea]|o mais r[aá]pido poss|o quanto antes|com pressa/i,

    OFERTA: /ofert|oferec|proposta|disponibiliz|dado prioridade|prioridade s[aã]o/i,

    trechoPedido(mensagem) {
        const texto = String(mensagem ?? "").replace(/Processo:[\s\S]*?Descrição OS anterior:/i, "");
        const achado = texto.match(this.PEDIDO);
        if (!achado) return null;
        const i = achado.index;
        if (this.OFERTA.test(texto.slice(Math.max(0, i - 80), i + 80))) return null;
        return texto.slice(Math.max(0, i - 150), i + 200).replace(/\s+/g, " ").trim();
    },

    pedidosDaOS(eventos) {
        const pedidos = [];
        for (const e of eventos ?? []) {
            const trecho = this.trechoPedido(e.msg ?? e.mensagem);
            if (trecho) pedidos.push({ data: e.data ?? null, trecho });
        }
        return pedidos.sort((a, b) => (a.data?.getTime?.() ?? 0) - (b.data?.getTime?.() ?? 0));
    }
};

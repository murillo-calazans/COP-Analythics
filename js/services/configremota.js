const ConfigRemota = (function () {
    const TABELA = "configuracoes_app";

    const ENTRADAS = [
        { chave: "config_colunas", local: "cop_analytics_config_colunas" },
        { chave: "assuntos_incluidos", local: "cop_analytics_assuntos_incluidos" },
        { chave: "funil_assuntos", local: "cop_analytics_funil_assuntos" },
        { chave: "diagnosticos_excluidos_tempo", local: "cop_analytics_diagnosticos_excluidos_tempo" },
        { chave: "diagnosticos_excluidos_recorrencia", local: "cop_analytics_diagnosticos_excluidos_recorrencia" },
        { chave: "diagnosticos_improdutivos", local: "cop_analytics_diagnosticos_improdutivos" },
        { chave: "assuntos_incluidos_cancelamento", local: "cop_analytics_assuntos_incluidos_cancelamento" },
        { chave: "setores_cop", local: "cop_analytics_setores_cop" },
        { chave: "assuntos_cop", local: "cop_analytics_assuntos_cop" }
    ];

    const porLocal = new Map(ENTRADAS.map(e => [e.local, e]));
    const porChave = new Map(ENTRADAS.map(e => [e.chave, e]));

    function lerLocal(local) {
        try {
            const bruta = localStorage.getItem(local);
            return bruta === null ? undefined : JSON.parse(bruta);
        } catch {
            return undefined;
        }
    }

    function gravarLocal(local, valor) {
        try {
            localStorage.setItem(local, JSON.stringify(valor));
        } catch (erro) {
            console.warn("ConfigRemota: não deu pra gravar no localStorage:", local, erro);
        }
    }

    async function carregarTudo() {
        let linhas;
        try {
            const { data, error } = await supabaseClient.from(TABELA).select("chave, valor");
            if (error) throw error;
            linhas = data ?? [];
        } catch (erro) {
            console.warn("ConfigRemota: não deu pra ler a config compartilhada; usando a local deste navegador.", erro);
            return;
        }

        const presentes = new Set();
        for (const linha of linhas) {
            const entrada = porChave.get(linha.chave);
            if (!entrada) continue;
            gravarLocal(entrada.local, linha.valor);
            presentes.add(linha.chave);
        }

        if (APP.usuario?.papel === "admin") {
            const faltando = ENTRADAS.filter(e => !presentes.has(e.chave) && lerLocal(e.local) !== undefined);
            if (faltando.length) {
                const payload = faltando.map(e => ({
                    chave: e.chave,
                    valor: lerLocal(e.local),
                    atualizado_por: APP.usuario?.email ?? null
                }));
                try {
                    const { error } = await supabaseClient.from(TABELA).upsert(payload, { onConflict: "chave" });
                    if (error) throw error;
                    console.log(`ConfigRemota: ${payload.length} configuração(ões) desta máquina publicada(s) no banco compartilhado.`);
                } catch (erro) {
                    console.warn("ConfigRemota: falha ao publicar a config local no banco.", erro);
                }
            }
        }
    }

    function sincronizar(local, valor) {
        gravarLocal(local, valor);
        const entrada = porLocal.get(local);
        if (!entrada) return;
        supabaseClient.from(TABELA)
            .upsert({
                chave: entrada.chave,
                valor,
                atualizado_por: APP.usuario?.email ?? null,
                atualizado_em: new Date().toISOString()
            }, { onConflict: "chave" })
            .then(({ error }) => {
                if (error) console.error("ConfigRemota: configuração salva só neste navegador — o banco recusou (sem permissão ou offline).", error);
            });
    }

    function remover(local) {
        try {
            localStorage.removeItem(local);
        } catch {}
        const entrada = porLocal.get(local);
        if (!entrada) return;
        supabaseClient.from(TABELA).delete().eq("chave", entrada.chave)
            .then(({ error }) => {
                if (error) console.error("ConfigRemota: falha ao remover a configuração do banco compartilhado.", error);
            });
    }

    return { carregarTudo, sincronizar, remover };
})();

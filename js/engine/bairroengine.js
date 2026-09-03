/**
 * ==========================================================
 * Bairro Engine
 * ==========================================================
 * Normaliza a grafia de ordem.bairro pra reduzir fragmentação nos
 * filtros e na busca — a mesma planilha às vezes traz o mesmo bairro
 * escrito de formas diferentes ("Centro"/"CENTRO ", "Agrobrasil"/
 * "Agro Brasil", erro de digitação tipo "Ancora"/"Âncora").
 *
 * NÃO persiste nada — roda em cima de APP.dados.ordens já em memória
 * (depois de carregar do Supabase/cache local, e depois de cada
 * import novo), sempre com o conjunto INTEIRO de OS disponível, pra
 * agrupar variantes de forma consistente independente de terem vindo
 * em importações/arquivos diferentes. ordem.bairro guarda o valor
 * original na 1ª passada, em ordem.bairroOriginal — o Supabase
 * continua guardando sempre o valor cru da planilha (a normalização
 * só existe em memória, no navegador).
 *
 * NÃO tem lista de bairros conhecidos nem correções específicas de
 * uma empresa — só agrupa grafias muito parecidas dentro da MESMA
 * cidade (nunca mistura bairros de cidades diferentes) e escolhe,
 * entre as variantes, a que parece mais "correta" pra mostrar (com
 * acento, com espaço, sem ficar tudo maiúsculo/minúsculo).
 */
const BairroEngine = {

    // Só funde grafias com distância de edição até esse valor — mantém
    // conservador de propósito, pra não misturar bairros diferentes
    // que por acaso têm nomes parecidos.
    DISTANCIA_MAXIMA_FUSAO: 1,

    limparChave(valor) {
        return normalizarTexto(valor)
            .replace(/[()[\]{}]/g, " ")
            .replace(/[^A-Z0-9 ]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    },

    /** "agro brasil" -> "Agro Brasil" — preposições curtas ficam minúsculas, exceto na 1ª palavra. */
    tituloBairro(valor) {
        const pequenos = new Set(["DA", "DE", "DO", "DAS", "DOS", "E"]);
        return String(valor ?? "")
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean)
            .map((parte, indice) => {
                const maiuscula = normalizarTexto(parte);
                if (indice > 0 && pequenos.has(maiuscula)) return parte.toLowerCase();
                return parte.charAt(0).toUpperCase() + parte.slice(1);
            })
            .join(" ");
    },

    /** Nota maior = grafia "mais bonita" pra mostrar (com acento, com espaço, não tudo maiúsculo/minúsculo, sem parênteses). */
    pontuarExibicao(valor) {
        const texto = String(valor ?? "").trim();
        if (!texto) return -999;

        let nota = 0;
        if (/[ÁÉÍÓÚÂÊÔÃÕÇÀÜáéíóúâêôãõçàü]/.test(texto)) nota += 8;
        if (/\s/.test(texto)) nota += 3;
        if (/^[A-Z0-9 ]+$/.test(texto)) nota -= 3;
        if (/^[a-z0-9 ]+$/.test(texto)) nota -= 2;
        if (/[()[\]{}]/.test(texto)) nota -= 6;
        return nota;
    },

    /** Distância de edição (Levenshtein) entre duas strings. */
    distanciaEdicao(a, b) {
        a = String(a ?? "");
        b = String(b ?? "");
        const m = a.length;
        const n = b.length;
        if (!m) return n;
        if (!n) return m;

        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const custo = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,      // remoção
                    dp[i][j - 1] + 1,      // inserção
                    dp[i - 1][j - 1] + custo // substituição
                );
            }
        }

        return dp[m][n];
    },

    /**
     * Bairro escrito como "Bairro (Sub-bairro)" — a parte entre
     * parênteses costuma ser a localidade operacional de verdade
     * (ex.: "Agrobrasil(Sambaetiba)" -> "Sambaetiba"). Ignora
     * parênteses curtos ou que são só sigla/lote (ex.: "(RJ)", "(LT 5)").
     */
    extrairParenteses(bairro) {
        const match = bairro.match(/\(([^)]+)\)/);
        if (!match || !match[1]) return null;

        const dentro = match[1].trim();
        const chave = this.limparChave(dentro);
        if (chave.length <= 2 || ["RJ", "BR", "LOTE", "LT", "QD", "QUADRA"].includes(chave)) return null;

        return this.tituloBairro(dentro);
    },

    /** Limpeza individual de UM valor de bairro — sem olhar pra mais nada. */
    normalizarUm(bairroOriginal) {
        const original = String(bairroOriginal ?? "").trim().replace(/\s+/g, " ");
        if (!original) return "";

        const doParenteses = this.extrairParenteses(original);
        if (doParenteses) return doParenteses;

        return this.tituloBairro(
            original.replace(/[()[\]{}]/g, " ").replace(/\s+/g, " ").trim()
        );
    },

    /** Entre variantes que já foram consideradas "o mesmo bairro", escolhe a mais frequente (empate: a de melhor grafia). */
    escolherCanonico(variantes) {
        const contagem = new Map();
        for (const variante of variantes) {
            contagem.set(variante, (contagem.get(variante) ?? 0) + 1);
        }

        return [...contagem.entries()]
            .sort((a, b) => (b[1] - a[1]) || (this.pontuarExibicao(b[0]) - this.pontuarExibicao(a[0])))[0]?.[0]
            ?? variantes[0] ?? "";
    },

    /**
     * Normaliza ordem.bairro de TODAS as OS recebidas, em 3 passos:
     *  1. Limpeza individual (parênteses, título) — não depende do resto do conjunto.
     *  2. Unifica grafias com a mesma "chave compactada", ex.:
     *     "São José" e "Sao Jose" viram a mesma coisa (varia só
     *     acento/espaço/maiúscula, sem erro de digitação).
     *  3. Unifica erros pequenos de digitação (distância de edição
     *     curta) dentro da MESMA cidade — nunca mistura bairros de
     *     cidades diferentes, mesmo que o nome seja parecido.
     * Idempotente: rodar de novo em cima de um conjunto já normalizado
     * não muda nada (os grupos já convergiram pra 1 variante só).
     */
    normalizarBairros(ordens) {
        for (const ordem of ordens.values()) {
            if (ordem.bairroOriginal === null || ordem.bairroOriginal === undefined) {
                ordem.bairroOriginal = ordem.bairro;
            }
            ordem.bairro = this.normalizarUm(ordem.bairroOriginal);
        }

        // Passo 2 — mesma chave compactada.
        const gruposCompactos = new Map();
        for (const ordem of ordens.values()) {
            const chave = this.limparChave(ordem.bairro).replace(/\s+/g, "");
            if (!chave) continue;
            if (!gruposCompactos.has(chave)) gruposCompactos.set(chave, []);
            gruposCompactos.get(chave).push(ordem.bairro);
        }

        const canonicoPorChaveCompacta = new Map();
        for (const [chave, variantes] of gruposCompactos) {
            canonicoPorChaveCompacta.set(chave, this.escolherCanonico(variantes));
        }

        for (const ordem of ordens.values()) {
            const chave = this.limparChave(ordem.bairro).replace(/\s+/g, "");
            if (canonicoPorChaveCompacta.has(chave)) ordem.bairro = canonicoPorChaveCompacta.get(chave);
        }

        // Passo 3 — erro pequeno de digitação, só dentro da mesma cidade.
        const ordensPorCidade = new Map();
        for (const ordem of ordens.values()) {
            const chaveCidade = this.limparChave(ordem.cidade || "SEM CIDADE");
            if (!ordensPorCidade.has(chaveCidade)) ordensPorCidade.set(chaveCidade, []);
            ordensPorCidade.get(chaveCidade).push(ordem);
        }

        for (const ordensCidade of ordensPorCidade.values()) {
            const rotulosDistintos = [...new Set(ordensCidade.map(o => o.bairro).filter(Boolean))];
            const rotulosCompactos = rotulosDistintos
                .map(rotulo => ({ rotulo, chave: this.limparChave(rotulo).replace(/\s+/g, "") }))
                .filter(item => item.chave.length >= 5); // bairro muito curto tem risco alto de falso positivo

            const canonicoPorRotulo = new Map();
            for (let i = 0; i < rotulosCompactos.length; i++) {
                for (let j = i + 1; j < rotulosCompactos.length; j++) {
                    const a = rotulosCompactos[i];
                    const b = rotulosCompactos[j];

                    const maior = Math.max(a.chave.length, b.chave.length);
                    const menor = Math.min(a.chave.length, b.chave.length);
                    if (maior - menor > this.DISTANCIA_MAXIMA_FUSAO) continue;
                    if (this.distanciaEdicao(a.chave, b.chave) > this.DISTANCIA_MAXIMA_FUSAO) continue;

                    const canonico = this.escolherCanonico([a.rotulo, b.rotulo]);
                    canonicoPorRotulo.set(a.rotulo, canonico);
                    canonicoPorRotulo.set(b.rotulo, canonico);
                }
            }

            if (canonicoPorRotulo.size === 0) continue;

            for (const ordem of ordensCidade) {
                if (canonicoPorRotulo.has(ordem.bairro)) ordem.bairro = canonicoPorRotulo.get(ordem.bairro);
            }
        }
    }

};

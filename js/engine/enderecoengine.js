/**
 * ==========================================================
 * Endereço Engine — cidade cadastrada × GPS da OS
 * ==========================================================
 * Acha cliente com endereço errado no IXC: a coordenada da OS (ordens.lat/
 * lng) cai em outra cidade, longe da cidade cadastrada — ou a OS está numa
 * cidade fora da área (CONFIG_ENDERECOS.cidadesSempreAlerta), que costuma
 * ser o endereço da sede do cliente. Agrupa por login, porque é o cadastro
 * do login que se corrige no IXC.
 *
 * Login cuja OS MAIS RECENTE já bate com o GPS conta como "já corrigido"
 * (o IXC foi acertado e as OS antigas só ficaram com o endereço velho) e
 * sai da lista — sem precisar marcar nada à mão.
 */
const EnderecoEngine = {

    distanciaKm(a, b) {
        const rad = x => x * Math.PI / 180;
        const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
        return 6371 * 2 * Math.asin(Math.sqrt(h));
    },

    chaveCidade(cidade) {
        return normalizarTexto(cidade ?? "").toLowerCase().trim();
    },

    // Pontos de base/escritório do recorte atual (ver pontosRepetidos).
    _pontosBase: new Set(),

    chavePonto(lat, lng) {
        return `${lat.toFixed(4)},${lng.toFixed(4)}`;
    },

    coordenadaNaCaixa(lat, lng) {
        const c = CONFIG_ENDERECOS.caixaValida;
        return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0
            && lat >= c.latMin && lat <= c.latMax && lng >= c.lngMin && lng <= c.lngMax;
    },

    /** Coordenadas que se repetem em OS de muitos logins diferentes = base/escritório, não o cliente. */
    pontosRepetidos(ordens) {
        const loginsPorPonto = new Map();
        for (const ordem of ordens.values()) {
            if (!this.coordenadaNaCaixa(ordem.lat, ordem.lng)) continue;
            const chave = this.chavePonto(ordem.lat, ordem.lng);
            if (!loginsPorPonto.has(chave)) loginsPorPonto.set(chave, new Set());
            loginsPorPonto.get(chave).add(ordem.login || ordem.id);
        }
        return new Set([...loginsPorPonto].filter(([, logins]) => logins.size >= CONFIG_ENDERECOS.minimoLoginsPontoRepetido).map(([chave]) => chave));
    },

    gpsValido(ordem) {
        return this.coordenadaNaCaixa(ordem.lat, ordem.lng) && !this._pontosBase.has(this.chavePonto(ordem.lat, ordem.lng));
    },

    mediana(valores) {
        const v = [...valores].sort((a, b) => a - b);
        const m = Math.floor(v.length / 2);
        return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    },

    /** Centro de cada cidade: fixo da config, senão mediana das OS dela (com amostra mínima). Também a grafia mais usada de cada cidade, pra exibir. */
    centrosDasCidades(ordens) {
        const pontos = new Map();
        const grafias = new Map();
        for (const ordem of ordens.values()) {
            const chave = this.chaveCidade(ordem.cidade);
            if (!chave) continue;
            if (!grafias.has(chave)) grafias.set(chave, new Map());
            grafias.get(chave).set(ordem.cidade, (grafias.get(chave).get(ordem.cidade) ?? 0) + 1);
            if (!this.gpsValido(ordem)) continue;
            if (!pontos.has(chave)) pontos.set(chave, []);
            pontos.get(chave).push([ordem.lat, ordem.lng]);
        }

        const centros = new Map();
        for (const [chave, coord] of Object.entries(CONFIG_ENDERECOS.centrosFixos)) centros.set(chave, coord);
        for (const [chave, lista] of pontos) {
            if (centros.has(chave) || lista.length < CONFIG_ENDERECOS.minimoOSCentro) continue;
            centros.set(chave, [this.mediana(lista.map(p => p[0])), this.mediana(lista.map(p => p[1]))]);
        }

        const nomeExibicao = new Map();
        for (const [chave, mapa] of grafias) nomeExibicao.set(chave, [...mapa].sort((a, b) => b[1] - a[1])[0][0]);
        return { centros, nomeExibicao };
    },

    /** Uma OS: null (endereço ok / sem como saber) ou { cidadeProvavel, distanciaKm, motivo }. */
    avaliarOS(ordem, centros, sempreAlerta) {
        const chave = this.chaveCidade(ordem.cidade);
        const temGps = this.gpsValido(ordem);
        const ponto = temGps ? [ordem.lat, ordem.lng] : null;

        let maisPerto = null, distMaisPerto = Infinity;
        if (ponto) {
            for (const [cidade, centro] of centros) {
                const d = this.distanciaKm(ponto, centro);
                if (d < distMaisPerto) { distMaisPerto = d; maisPerto = cidade; }
            }
        }

        if (!chave) {
            return ponto ? { cidadeProvavel: maisPerto, distanciaKm: null, motivo: "Cidade em branco no cadastro" } : null;
        }

        if (sempreAlerta.has(chave)) {
            const provavel = maisPerto && maisPerto !== chave ? maisPerto : null;
            return {
                cidadeProvavel: provavel,
                distanciaKm: ponto && centros.has(chave) ? this.distanciaKm(ponto, centros.get(chave)) : null,
                motivo: provavel ? "Cidade fora da área — GPS em outra cidade (endereço da sede?)" : "Cidade fora da área de atendimento"
            };
        }

        if (!ponto || !centros.has(chave)) return null;
        const dist = this.distanciaKm(ponto, centros.get(chave));
        if (dist <= CONFIG_ENDERECOS.limiteKm) return null;
        if (maisPerto === chave || distMaisPerto > dist - CONFIG_ENDERECOS.margemKm) return null;
        return { cidadeProvavel: maisPerto, distanciaKm: dist, motivo: "GPS da OS em outra cidade" };
    },

    /**
     * Logins com endereço a corrigir (recorte recebido — normalmente
     * FiltroEngine.ordensFiltradas()). Devolve { logins, resumo }.
     */
    calcular(ordens) {
        this._pontosBase = this.pontosRepetidos(ordens);
        const { centros, nomeExibicao } = this.centrosDasCidades(ordens);
        const sempreAlerta = new Set(CONFIG_ENDERECOS.cidadesSempreAlerta.map(c => this.chaveCidade(c)));
        const nome = chave => chave ? (nomeExibicao.get(chave) ?? chave.replace(/\b\w/g, l => l.toUpperCase())) : null;

        const porLogin = new Map();
        for (const ordem of ordens.values()) {
            const chave = ordem.login || `cliente:${ordem.cliente ?? ordem.id}`;
            if (!porLogin.has(chave)) porLogin.set(chave, []);
            porLogin.get(chave).push(ordem);
        }

        const logins = [];
        let jaCorrigidos = 0;
        for (const [chave, lista] of porLogin) {
            const avaliadas = lista.map(o => ({ ordem: o, achado: this.avaliarOS(o, centros, sempreAlerta) }));
            const suspeitas = avaliadas.filter(a => a.achado);
            if (suspeitas.length === 0) continue;

            const data = o => o.dataAbertura?.getTime?.() ?? 0;
            avaliadas.sort((a, b) => data(b.ordem) - data(a.ordem));
            const maisRecente = avaliadas[0];
            if (!maisRecente.achado && this.gpsValido(maisRecente.ordem)) { jaCorrigidos++; continue; }

            suspeitas.sort((a, b) => data(b.ordem) - data(a.ordem));
            const ref = suspeitas[0];
            const votos = new Map();
            for (const s of suspeitas) if (s.achado.cidadeProvavel) votos.set(s.achado.cidadeProvavel, (votos.get(s.achado.cidadeProvavel) ?? 0) + 1);
            const [provavel, qtdVotos] = [...votos].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];

            logins.push({
                login: lista[0].login ?? null,
                cliente: ref.ordem.cliente ?? null,
                cidadeCadastrada: ref.ordem.cidade ?? null,
                bairroCadastrado: ref.ordem.bairro ?? null,
                cidadeProvavel: nome(provavel),
                distanciaKm: ref.achado.distanciaKm,
                motivo: ref.achado.motivo,
                confianca: qtdVotos >= 2 ? "alta" : provavel ? "media" : "sem-gps",
                foraDaArea: sempreAlerta.has(this.chaveCidade(ref.ordem.cidade)),
                qtdOS: lista.length,
                qtdSuspeitas: suspeitas.length,
                ultimaOS: { id: ref.ordem.id, data: ref.ordem.dataAbertura ?? null, assunto: ref.ordem.assunto ?? null },
                lat: this.gpsValido(ref.ordem) ? ref.ordem.lat : null,
                lng: this.gpsValido(ref.ordem) ? ref.ordem.lng : null,
                idsOS: suspeitas.map(s => s.ordem.id)
            });
        }

        const ordemConfianca = { alta: 0, media: 1, "sem-gps": 2 };
        logins.sort((a, b) => ordemConfianca[a.confianca] - ordemConfianca[b.confianca] || b.qtdSuspeitas - a.qtdSuspeitas
            || (b.ultimaOS.data?.getTime?.() ?? 0) - (a.ultimaOS.data?.getTime?.() ?? 0));

        return {
            logins,
            resumo: {
                logins: logins.length,
                osAfetadas: logins.reduce((s, l) => s + l.qtdSuspeitas, 0),
                confiancaAlta: logins.filter(l => l.confianca === "alta").length,
                foraDaArea: logins.filter(l => l.foraDaArea).length,
                jaCorrigidos,
                pontosBase: this._pontosBase.size
            }
        };
    }
};

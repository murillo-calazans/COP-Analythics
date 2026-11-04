(function (global) {
  'use strict';

  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  function parseDataBR(v) {
    if (v instanceof Date) return v;
    if (typeof v === 'number') {
      const d = new Date(Math.round((v - 25569) * 864e5));
      return new Date(d.getTime() + d.getTimezoneOffset() * 6e4);
    }
    const m = String(v || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    return m ? new Date(+m[3], m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : null;
  }

  function resolverColunas(headers) {
    const byNorm = {};
    headers.forEach(h => { byNorm[norm(h)] = h; });
    const pick = (...alts) => { for (const a of alts) { if (byNorm[norm(a)] !== undefined) return byNorm[norm(a)]; } return null; };
    return {
      id: pick('ID OS', 'ID'),
      cliente: pick('CLIENTE'),
      colab: pick('COLABORADOR RESPONSAVEL', 'COLABORADOR RESPONSÁVEL'),
      login: pick('LOGIN'),
      statusAcesso: pick('STATUS ACESSO'),
      evento: pick('EVENTO'),
      status: pick('STATUS'),
      diagnostico: pick('DIAGNOSTICO', 'DIAGNÓSTICO'),
      mensagem: pick('MENSAGEM'),
      assunto: pick('ASSUNTO'),
      data: pick('DATA'),
      abertura: pick('DATA/HORA ABERTURA'),
      historico: pick('HISTÓRICO', 'HISTARICO', 'HISTORICO'),
      plano: pick('DESCRIÇÃO', 'DESCRIAAO', 'DESCRICAO'),
      cidade: pick('CIDADE'),
      bairro: pick('BAIRRO'),
      prioridade: pick('PRIORIDADE'),
      lat: pick('LATITUDE'),
      lng: pick('LONGITUDE'),
    };
  }

  const PADRAO_PARAMS = {
    durInstalacao: 90, durManutencao: 60, durTroca: 45, durRecolhimento: 30,
    velocidadeKmh: 30, fatorEstrada: 1.4, almocoMin: 60, maxOS: 8, maxOSInstalador: 5, raioRegiaoKm: 5, maxForaRotaKm: 8,
  };

  const NAO_CAMPO = /auditoria|exclusao de acesso|instalacao nao concluida|mudanca de tecnologia nao concluida|nova tentativa de instalacao|configurar conexao|configuracao telefonia|verificar troca de plano|chip|orcamento|remocao telefonia|area de manutencao|expansao de rede|rearranjo|cto sem potencia|ajuste de potencia|melhoria de rede|cto sem vaga|verificar viabilidade|pos terceirizada|esim|licitacao|inviabilidade|construcao de rede|reagendamento suporte|cliente indisponivel|faturar debitos|ip fixo/;

  const assuntoEhDeCampo = assunto => !NAO_CAMPO.test(norm(assunto));

  const RE_VISITANTE = /Usu[aá]rio\s+(.+?)\s*,\s*(?:iniciou o deslocamento|executou)/i;

  function nomeBate(nomeIxc, tech) {
    const real = norm(nomeIxc).replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
    const tem = w => real.some(r => r === w || (w.length >= 5 && distEdicao(r, w) <= 1));
    return [tech.nome, tech.dupla].filter(Boolean).some(n => {
      const ps = norm(n.replace(/\(.*?\)/g, ' ')).replace(/[^a-z ]/g, ' ').split(' ').filter(w => w.length > 2);
      return ps.length && ps.every(tem);
    });
  }

  const ehTransfAssunto = o => /transferencia/.test(norm(o.assunto));

  function tipoServico(assunto) {
    const a = norm(assunto);

    const setor = /transferencia/.test(a) ? 'manutencao'
      : /instala|terceirizad|mudanca de tecnologia|ultima milha|parceria/.test(a) ? 'instalador' : 'manutencao';
    let dur = 'durManutencao';
    if (/recolhimento|retirada/.test(a)) dur = 'durRecolhimento';
    else if (/instala|transferencia|tecnologia|ultima milha/.test(a)) dur = 'durInstalacao';
    else if (/troca de equipamento|troca de senha|repetidor|troca de comodo/.test(a)) dur = 'durTroca';
    return { setor, dur };
  }

  function lerPreferencia(msgs, ref) {
    const p = { janela: null, aPartir: null, fdsOnly: false, fdsMencao: false, ausencias: 0, texto: '', textoData: null, diaPedido: null };
    const ordenadas = msgs.slice().sort((a, b) => b.data - a.data);
    const mesmoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    let viuDataCitada = false;
    const fonte = m => { if (!p.texto) { p.texto = m.texto; p.textoData = m.data; } };
    for (const m of ordenadas) {
      const t = norm(m.texto);

      if (!t || /termos da adesao|o contrato esta assinado/.test(t)) continue;
      if (/nao estava em casa|cliente ausente|nao se encontra|ninguem em casa|estava no trabalho|estaria trabalhando|esta no servico|esta no trabalho/.test(t)) p.ausencias++;
      const d = m.evento !== 1 && t.match(/(?:^|[^\d\/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d\/])/);

      const relativo = !d && m.data && (/(^|[^a-z])amanha/.test(t) ? 1 : (/(^|[^a-z])hoje([^a-z]|$)/.test(t) ? 0 : null));
      if ((d || relativo != null && relativo !== false) && ref) {
        let citada;
        if (d) {
          const ano = d[3] ? (d[3].length === 2 ? 2000 + +d[3] : +d[3]) : ref.getFullYear();
          citada = +d[2] >= 1 && +d[2] <= 12 ? new Date(ano, +d[2] - 1, +d[1]) : new Date(NaN);
        } else {
          citada = new Date(m.data.getFullYear(), m.data.getMonth(), m.data.getDate() + relativo);
        }
        if (!isNaN(citada)) {
          const primeira = !viuDataCitada;
          viuDataCitada = true;
          if (!mesmoDia(citada, ref)) {

            if (primeira && citada > ref && citada - ref < 60 * 864e5) { p.diaPedido = citada; fonte(m); }
            continue;
          }
        }
      }
      if (!p.janela) {
        if (/qualquer hor/.test(t)) { p.janela = 'qualquer'; fonte(m); }
        else if (/(parte|periodo|pela|a|na|de) tarde(?![a-z])/.test(t)) { p.janela = 'tarde'; fonte(m); }
        else if (/(^|[^a-z])(parte|periodo|pela|de|na) manha/.test(t) || /(^|[^a-z])manha cedo/.test(t)) { p.janela = 'manha'; fonte(m); }
      }
      if (p.aPartir == null) {

        const h = t.match(/(apos|a partir d[ae]s?|depois d[ae]s?|so (?:chega|esta|fica|estara)[^0-9]{0,30}?)\s*(?:(?:as\s*)(\d{1,2})(?::(\d{2}))?(?!\s*(?:dia|mes|\/))|(\d{1,2})(?::(\d{2})|\s*(?:h|hs|hrs|horas)(?![a-z])))/);
        if (h) {
          if (h[4] != null) { h[2] = h[4]; h[3] = h[5]; }
          const hora = +h[2];
          if (hora >= 7 && hora <= 21) { p.aPartir = hora * 60 + (+(h[3] || 0)); fonte(m); }
        }
      }
      if (/final de semana|fim de semana|sabado/.test(t)) {
        p.fdsMencao = true;

        const alternativa = /(final de semana|fim de semana|sabado)[^.]{0,30}\sou\s[^.]{0,30}(apos|depois|a partir|\d{1,2}\s*h|\d{1,2}:\d{2}|noite|tarde)/.test(t);
        if (!alternativa && /(so|somente|apenas)[^.]{0,40}(final de semana|fim de semana|sabado)/.test(t)) { p.fdsOnly = true; fonte(m); }
      }
    }
    if (p.aPartir != null && p.aPartir >= 12 * 60 && !p.janela) p.janela = 'tarde';
    return p;
  }

  function lerMapaRegioes(html) {
    const pega = nome => {
      const i = html.indexOf('const ' + nome + ' = [');
      if (i < 0) return null;
      const j = html.indexOf('];', i);
      return html.slice(html.indexOf('[', i), j + 1);
    };
    const aJSON = t => t.replace(/\/\/[^\n]*/g, '').replace(/([{,]\s*)([a-zA-Z_]+)\s*:/g, '$1"$2":').replace(/,\s*([\]}])/g, '$1');
    try {
      const cidades = JSON.parse(aJSON(pega('CITIES')));
      const regioes = JSON.parse(aJSON(pega('REGIONS')));
      const bairros = JSON.parse(aJSON(pega('BAIRROS')));
      if (!regioes.length || !bairros.length) return null;
      return { cidades, regioes, bairros };
    } catch (e) { return null; }
  }

  const chaveBairro = s => norm(s).replace(/\(.*?\)/g, ' ')
    .replace(/(^|\s)(jardim|jd|parque|pq|vila|vl|loteamento|lot|condominio|cond|bairro|residencial|estrada|estr|alto|morro)\.?(?=\s|$)/g, ' ')
    .replace(/(^|\s)(de|da|do|das|dos)(?=\s|$)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  function distEdicao(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }

  function indiceMapa(dados) {
    if (!dados) return null;
    const nomeCidade = Object.fromEntries(dados.cidades.map(c => [c.id, c.name]));
    const regiao = Object.fromEntries(dados.regioes.map(r => [r.id, { id: r.id, nome: r.name, cidade: nomeCidade[r.cityId] || '' }]));
    const itens = dados.bairros.filter(b => regiao[b[1]]).map(([nome, rid, lat, lng]) => ({ chave: chaveBairro(nome), regiao: regiao[rid], lat, lng }));

    for (const r of Object.values(regiao)) {
      const bs = itens.filter(i => i.regiao === r);
      if (bs.length) itens.push({ chave: chaveBairro(r.nome), regiao: r, lat: bs.reduce((s, b) => s + b.lat, 0) / bs.length, lng: bs.reduce((s, b) => s + b.lng, 0) / bs.length });
    }
    const regioesPorCidade = {};
    Object.values(regiao).forEach(r => { (regioesPorCidade[norm(r.cidade)] = regioesPorCidade[norm(r.cidade)] || []).push(r); });
    return { itens: itens.filter(i => i.chave), regioesPorCidade, total: { regioes: dados.regioes.length, bairros: dados.bairros.length } };
  }

  function localizarNoMapa(idx, cidade, bairro, lat, lng) {
    if (!idx) return null;
    const k = chaveBairro(bairro);
    const daCidade = !!idx.regioesPorCidade[norm(cidade)];
    const cands = [];
    if (k) for (const it of idx.itens) {
      if (daCidade && norm(it.regiao.cidade) !== norm(cidade)) continue;
      let nota = 0;
      if (it.chave === k) nota = 3;
      else if (k.length >= 6 && it.chave.length >= 6 && distEdicao(it.chave, k) <= 1) nota = 2;
      else if (Math.min(k.length, it.chave.length) >= 5 && (k.includes(it.chave) || it.chave.includes(k))) nota = 1;
      if (nota) cands.push({ it, nota: nota + Math.min(it.chave.length, 40) / 100 + (norm(it.regiao.cidade) === norm(cidade) ? 10 : 0) });
    }
    if (cands.length) {
      const m = cands.sort((a, b) => b.nota - a.nota)[0].it;
      return { regiao: m.regiao, lat: m.lat, lng: m.lng };
    }
    if (daCidade && lat && lng) {
      let perto = null, menor = 1.5;
      for (const it of idx.itens) {
        if (norm(it.regiao.cidade) !== norm(cidade)) continue;
        const d = distKm(it, { lat, lng });
        if (d < menor) { menor = d; perto = it; }
      }
      if (perto) return { regiao: perto.regiao, lat: null, lng: null };
    }
    const unicas = idx.regioesPorCidade[norm(cidade)];
    return unicas && unicas.length === 1 ? { regiao: unicas[0], lat: null, lng: null } : null;
  }

  function montarOS(rows, ref, params, mapaIdx) {
    if (!rows.length) return { os: [], stats: {} };
    const c = resolverColunas(Object.keys(rows[0]));
    const grupos = new Map();
    for (const r of rows) {
      const id = r[c.id];
      if (id === '' || id == null) continue;
      if (!grupos.has(id)) grupos.set(id, []);
      grupos.get(id).push({ r, data: parseDataBR(r[c.data]) });
    }

    const aberturasPorLogin = {};

    const somaBairro = {}, somaCidade = {};

    const contagemNome = {};
    for (const r of rows) {
      const id = String(r[c.colab] == null ? '' : r[c.colab]).trim();
      let nome = null;
      const a = String(r[c.mensagem] || '').match(/assumida pelo colaborador\(a\):\s*(\d+)\s*-\s*(.+)/i);
      if (a) { (contagemNome[a[1]] = contagemNome[a[1]] || {})[a[2].trim()] = 99; continue; }
      if (!id || id === '0') continue;
      const d = String(r[c.historico] || '').match(/Usu[aá]rio\s+(.+?)\s*,\s*iniciou o deslocamento/i);
      if (d) nome = d[1].trim();
      if (nome) { const m = (contagemNome[id] = contagemNome[id] || {}); m[nome] = (m[nome] || 0) + 1; }
    }
    const nomeColab = {};
    for (const [id, nomes] of Object.entries(contagemNome)) nomeColab[id] = Object.entries(nomes).sort((x, y) => y[1] - x[1])[0][0];

    const gpsPorCidade = {};
    for (const [, evs] of grupos) {
      const f = evs[0].r, lat = +f[c.lat], lng = +f[c.lng];
      if (lat && lng) (gpsPorCidade[norm(f[c.cidade])] = gpsPorCidade[norm(f[c.cidade])] || []).push({ lat, lng });
    }
    const medianaCidade = {};
    for (const [cid, pts] of Object.entries(gpsPorCidade)) {
      const med = xs => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
      medianaCidade[cid] = { lat: med(pts.map(p => p.lat)), lng: med(pts.map(p => p.lng)) };
    }
    const gpsValido = (cidade, lat, lng) => {
      if (!(lat && lng)) return false;
      const m = medianaCidade[norm(cidade)];
      return !m || distKm(m, { lat, lng }) <= 40;
    };

    for (const [, evs] of grupos) {
      evs.sort((a, b) => (a.data || 0) - (b.data || 0));
      const f = evs[0].r;
      const ab = parseDataBR(f[c.abertura]) || evs[0].data;
      const login = f[c.login];
      if (login) (aberturasPorLogin[login] = aberturasPorLogin[login] || []).push({ id: evs[0].r[c.id], ab });
      const lat = +f[c.lat], lng = +f[c.lng];
      if (gpsValido(f[c.cidade], lat, lng)) {
        const kb = norm(f[c.cidade]) + '|' + norm(f[c.bairro]);
        const kc = norm(f[c.cidade]);
        (somaBairro[kb] = somaBairro[kb] || [0, 0, 0]);
        somaBairro[kb][0] += lat; somaBairro[kb][1] += lng; somaBairro[kb][2]++;
        (somaCidade[kc] = somaCidade[kc] || [0, 0, 0]);
        somaCidade[kc][0] += lat; somaCidade[kc][1] += lng; somaCidade[kc][2]++;
      }
    }

    const ehCampo = assunto => !NAO_CAMPO.test(norm(assunto));

    const lista = [];
    let fechadasPorDiagnostico = 0;
    const umDia = 864e5;
    for (const [id, evs] of grupos) {
      const passado = evs.filter(e => e.data && e.data < ref);
      if (!passado.length) continue;
      const ult = passado[passado.length - 1].r;
      if (norm(ult[c.status]) === 'finalizada') continue;

      if (!evs.some(e => norm(e.r[c.status]) === 'finalizada') && evs.some(e => String(e.r[c.diagnostico] || '').trim())) { fechadasPorDiagnostico++; continue; }
      const f = evs[0].r;
      const abertura = parseDataBR(f[c.abertura]) || evs[0].data;
      const msgs = passado.map(e => ({ data: e.data, texto: e.r[c.mensagem], evento: +e.r[c.evento] }));
      const agend = passado.filter(e => +e.r[c.evento] === 5);
      let agendaIxc = null;
      const iAg = passado.map(e => +e.r[c.evento]).lastIndexOf(5);
      if (iAg >= 0 && !passado.slice(iAg + 1).some(e => norm(e.r[c.status]) === 'deslocamento' || [9, 10].includes(+e.r[c.evento]))) {
        const ev = passado[iAg];
        const id = String(ev.r[c.colab] == null ? '' : ev.r[c.colab]).trim();

        const t = norm(ev.r[c.mensagem]);
        let dia = null;
        const dm = t.match(/(?:^|[^\d\/])(\d{1,2})\/(\d{1,2})(?![\d\/])/);
        if (dm && +dm[2] >= 1 && +dm[2] <= 12) dia = new Date(ref.getFullYear(), +dm[2] - 1, +dm[1]);
        else if (/(^|[^a-z])amanha/.test(t)) dia = new Date(ev.data.getFullYear(), ev.data.getMonth(), ev.data.getDate() + 1);
        else if (/(^|[^a-z])hoje([^a-z]|$)/.test(t)) dia = new Date(ev.data.getFullYear(), ev.data.getMonth(), ev.data.getDate());
        if (id && id !== '0') agendaIxc = { colab: id, tecnico: nomeColab[id] || null, em: ev.data, dia };
      }
      const reag = passado.filter(e => +e.r[c.evento] === 10).length;

      const idas = passado.filter(e => norm(e.r[c.status]) === 'deslocamento' || +e.r[c.evento] === 9);
      const visitas = new Set(idas.map(e => e.data.toDateString())).size;
      const visitantes = [];
      idas.slice().reverse().forEach(e => {
        const m = String(e.r[c.historico] || '').match(RE_VISITANTE);
        if (m && !visitantes.includes(m[1].trim())) visitantes.push(m[1].trim());
      });
      const login = f[c.login];
      const recorrIds = (aberturasPorLogin[login] || []).filter(x => x.ab && x.ab >= new Date(ref - 30 * umDia) && x.ab < ref).map(x => String(x.id));
      const recorr = recorrIds.length;

      const gpsBruto = gpsValido(f[c.cidade], +f[c.lat], +f[c.lng]);
      const loc = localizarNoMapa(mapaIdx, f[c.cidade], f[c.bairro], gpsBruto ? +f[c.lat] : null, gpsBruto ? +f[c.lng] : null);
      const locOk = !!loc && (norm(loc.regiao.cidade) === norm(f[c.cidade]) ||
        (loc.lat != null && !!medianaCidade[norm(f[c.cidade])] && gpsValido(f[c.cidade], loc.lat, loc.lng)));
      const regiaoMapa = locOk ? loc.regiao : null;

      let lat = +f[c.lat], lng = +f[c.lng], coordFonte = 'gps';
      const gpsForaDaCidade = !!(lat && lng) && !gpsValido(f[c.cidade], lat, lng);
      if (!gpsValido(f[c.cidade], lat, lng)) {
        const b = somaBairro[norm(f[c.cidade]) + '|' + norm(f[c.bairro])];
        const ci = somaCidade[norm(f[c.cidade])];
        if (locOk && loc.lat != null) { lat = loc.lat; lng = loc.lng; coordFonte = 'mapa'; }
        else if (b) { lat = b[0] / b[2]; lng = b[1] / b[2]; coordFonte = 'bairro'; }
        else if (ci) { lat = ci[0] / ci[2]; lng = ci[1] / ci[2]; coordFonte = 'cidade'; }
        else { lat = null; lng = null; coordFonte = null; }
      }

      let realExec = null;
      const exec = evs.find(e => e.data && e.data >= ref && +e.r[c.evento] === 9);
      if (exec) {
        const m = String(exec.r[c.historico] || '').match(/Usu[aá]rio\s+(.+?)\s*,\s*executou/i);
        realExec = m ? m[1].trim() : null;
      }

      const ts = tipoServico(f[c.assunto]);

      const naoAgendar = /recolhimento|retirada de equipamento/.test(norm(f[c.assunto]));
      const pref = lerPreferencia(msgs, ref);
      const prioridade = String(ult[c.prioridade] || f[c.prioridade] || 'Normal').trim() || 'Normal';
      const idadeDias = Math.max(0, Math.floor((ref - abertura) / umDia));
      const status = String(ult[c.status]).trim();

      let score = 0;

      const prioritaria = /visita tecnica prioritaria|sem conexao/.test(norm(f[c.assunto]));
      if (norm(prioridade) === 'critica' || prioritaria) score += 100;
      else if (norm(prioridade) === 'alta') score += 50;

      const marcadaHoje = !!agendaIxc && !(agendaIxc.dia && agendaIxc.dia > ref);
      if (marcadaHoje) score += 60;
      score += Math.min(reag * 10, 40);
      score += Math.min(idadeDias * 2, 40);
      if (recorr >= 2) score += 15;

      lista.push({
        id, cliente: f[c.cliente], login, statusAcesso: ult[c.statusAcesso] || f[c.statusAcesso],
        assunto: f[c.assunto], diagnostico: ult[c.diagnostico], plano: f[c.plano],
        cidade: f[c.cidade], bairro: f[c.bairro], prioridade, lat, lng, coordFonte, gpsForaDaCidade, regiaoMapa,
        abertura, idadeDias, status, agendadaEm: agend.length ? agend[agend.length - 1].data : null,
        reagendamentos: reag, visitas, visitantes, agendaIxc, marcadaHoje, prioritaria, recorrencia30: recorr, recorrenciaIds: recorrIds, ultimoAtendimento: null, pref,
        ultimaMensagem: String(passado[passado.length - 1].r[c.mensagem] || ''),
        setor: ts.setor, dur: params[ts.dur], campo: ehCampo(f[c.assunto]) && !naoAgendar, motivoFora: naoAgendar ? 'Recolhimento/retirada de equipamento: não entra no roteiro' : '', realExec, score,
      });
    }
    return { os: lista, stats: { totalOS: grupos.size, fechadasPorDiagnostico } };
  }

  function aplicarHistorico(osList, historico, ref) {
    const umDia = 864e5, desde = new Date(ref - 30 * umDia);
    const porLogin = {};
    for (const h of historico || []) {
      if (!h.login) continue;
      (porLogin[h.login] = porLogin[h.login] || []).push({
        id: String(h.id), assunto: h.assunto, tecnico: h.tecnico_responsavel,
        abertura: h.data_abertura ? new Date(h.data_abertura) : null,
        fechamento: h.data_fechamento ? new Date(h.data_fechamento) : null,
      });
    }
    for (const o of osList) {
      const hs = porLogin[o.login] || [];
      const ids = new Set(o.recorrenciaIds);
      hs.forEach(h => { if (h.abertura && h.abertura >= desde && h.abertura < ref) ids.add(h.id); });
      const antes = o.recorrencia30;
      o.recorrencia30 = ids.size;
      if (antes < 2 && o.recorrencia30 >= 2) o.score += 15;
      const fechadas = hs.filter(h => h.id !== String(o.id) && h.fechamento && h.fechamento < ref && h.tecnico)
        .sort((a, b) => b.fechamento - a.fechamento);
      if (fechadas.length) {
        const u = fechadas[0];
        o.ultimoAtendimento = { tecnico: u.tecnico, data: u.fechamento, assunto: u.assunto, dias: Math.floor((ref - u.fechamento) / umDia) };
      }
    }
    return osList;
  }

  function distKm(a, b) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function lerMapeamento(texto) {
    const mapa = {};
    String(texto || '').split(/\r?\n/).forEach(l => {
      const i = l.indexOf('=');
      if (i < 0) return;
      const cidade = norm(l.slice(0, i));
      const secoes = l.slice(i + 1).split(';').map(norm).filter(Boolean);
      if (cidade && secoes.length) mapa[cidade] = secoes;
    });
    return mapa;
  }

  const hhmm = min => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(Math.round(min % 60)).padStart(2, '0');
  const lerHora = s => { const m = String(s).match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };

  function planejar(osList, techs, mapeamentoTexto, params, ref, regioesTexto) {
    const mapa = lerMapeamento(mapeamentoTexto);
    const regioes = lerRegioes(regioesTexto);
    const secoesEscala = new Set(techs.map(t => norm(t.secao)));
    const viagemMin = km => km * params.fatorEstrada / params.velocidadeKmh * 60;

    const pai = {};
    const achar = x => { pai[x] = pai[x] || x; return pai[x] === x ? x : (pai[x] = achar(pai[x])); };
    const unir = (a, b) => { pai[achar(a)] = achar(b); };
    secoesEscala.forEach(s => achar(s));
    Object.values(mapa).forEach(secs => secs.forEach(s => unir(s, secs[0])));

    const fimDeSemana = ref.getDay() === 0 || ref.getDay() === 6;
    const semTecnico = [], foraCampo = [];
    const pools = {};
    const poolDe = s => (pools[achar(s)] = pools[achar(s)] || { chave: achar(s), secoes: new Set(), itens: [], techs: [] });

    techs.forEach(t => { const p = poolDe(norm(t.secao)); p.secoes.add(t.secao); p.techs.push(t); });

    for (const os of osList) {
      if (!os.campo) { foraCampo.push(os); continue; }
      const cid = norm(os.cidade);
      const secs = mapa[cid] || (secoesEscala.has(cid) ? [cid] : null);
      if (!secs || !secs.some(s => secoesEscala.has(s))) { semTecnico.push({ os, motivo: 'Cidade sem equipe na escala: ' + (os.cidade || '(vazio)') }); continue; }
      if (os.pref.fdsOnly && !fimDeSemana) { semTecnico.push({ os, motivo: 'Cliente só recebe no fim de semana' }); continue; }
      if (os.pref.diaPedido) { semTecnico.push({ os, motivo: 'Cliente pediu o dia ' + os.pref.diaPedido.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }); continue; }
      if (os.lat == null) { semTecnico.push({ os, motivo: 'Sem coordenada nem bairro conhecido' }); continue; }
      poolDe(secs.find(s => secoesEscala.has(s))).itens.push(os);
    }

    const rotas = [];
    for (const pool of Object.values(pools)) {
      if (!pool.itens.length && !pool.techs.length) continue;
      const comCoord = pool.itens.filter(o => o.lat != null);
      const base = comCoord.length
        ? { lat: comCoord.reduce((s, o) => s + o.lat, 0) / comCoord.length, lng: comCoord.reduce((s, o) => s + o.lng, 0) / comCoord.length }
        : null;

      const equipes = pool.techs.map(t => {
        const ini = lerHora(t.horario) ?? 480, fim = lerHora(String(t.horario).split(/[–-]/)[1]) ?? 1020;
        return { tech: t, inicio: ini, fim, cap: fim - ini - params.almocoMin, usado: 0, stops: [] };
      });
      const porSetor = s => equipes.filter(e => e.tech.setor === s);

      const filas = { instalador: [], manutencao: [] };
      for (const o of pool.itens) {
        let s = o.setor;
        if (!porSetor(s).length) {
          const outro = s === 'instalador' ? 'manutencao' : 'instalador';
          if (porSetor(outro).length) { o.fallbackSetor = true; if (ehTransfAssunto(o)) o.terceiroUltimoCaso = true; s = outro; }
          else { semTecnico.push({ os: o, motivo: 'Nenhum técnico escalado nesse grupo de cidades' }); continue; }
        }
        filas[s].push(o);
      }

      const nomeGrupo = [...pool.secoes].join(' / ');
      const cabe = e => { sequenciar(e, base, params, viagemMin); return !e.paradas.some(p => p.fimMin > e.fim + 15); };

      const ehTransf = o => /transferencia/.test(norm(o.assunto));
      const transfParaTerceiro = [];
      for (const setor of ['manutencao', 'instalador']) {
        const eqs = porSetor(setor);
        if (setor === 'instalador' && transfParaTerceiro.length) {
          transfParaTerceiro.forEach(o => { o.terceiroUltimoCaso = true; filas.instalador.push(o); });
          transfParaTerceiro.length = 0;
        }
        if (!eqs.length) continue;

        const cap = setor === 'instalador' ? (params.maxOSInstalador || params.maxOS) : params.maxOS;

        const naoCabe = (o, motivo) => (setor === 'manutencao' && ehTransf(o) && porSetor('instalador').length)
          ? transfParaTerceiro.push(o) : semTecnico.push({ os: o, motivo });

        const duplaObrigatoria = setor === 'manutencao' && [...pool.secoes].some(x => norm(x) === 'nova friburgo');
        const prefereDupla = o => setor === 'manutencao' && precisaDupla(o);
        const exigeDupla = o => duplaObrigatoria && precisaDupla(o);
        const duplas = eqs.filter(e => e.tech.dupla);
        const fila = filas[setor].sort((a, b) => (a.terceiroUltimoCaso ? 1 : 0) - (b.terceiroUltimoCaso ? 1 : 0) || b.score - a.score);

        const soDupla = fila.filter(prefereDupla);
        let livres = fila.filter(o => !prefereDupla(o));
        const entraDupla = soDupla.slice(0, duplas.length * cap);
        const excessoDupla = soDupla.slice(duplas.length * cap);
        if (duplaObrigatoria) excessoDupla.forEach(o => semTecnico.push({ os: o, motivo: duplas.length
          ? 'Sem conexão exige dupla e as duplas já estão com ' + cap + ' OS em ' + nomeGrupo
          : 'Sem conexão exige dupla e não há técnico de manutenção em dupla em ' + nomeGrupo }));
        else livres = [...excessoDupla, ...livres].sort((a, b) => b.score - a.score);
        const vagasLivres = eqs.length * cap - entraDupla.length;
        const entraLivre = livres.slice(0, vagasLivres);
        livres.slice(vagasLivres).forEach(o => naoCabe(o, 'Técnicos já estão com ' + cap + ' OS em ' + nomeGrupo));

        eqs.forEach(e => { e.stops = []; });

        const comVisitante = new Set();
        for (const o of [...entraDupla, ...entraLivre]) {
          for (const nome of o.visitantes || []) {
            const e = eqs.find(x => x.stops.length < cap && (!exigeDupla(o) || x.tech.dupla) && nomeBate(nome, x.tech));
            if (e) { e.stops.push(o); o.mesmoTecnico = nome; comVisitante.add(o); break; }
          }
        }
        const opcoes = { regioes, raio: params.raioRegiaoKm };
        const sobraDupla = distribuirPorRegiao(entraDupla.filter(o => !comVisitante.has(o)), duplas, cap, opcoes);
        if (duplaObrigatoria) sobraDupla.forEach(o => semTecnico.push({ os: o, motivo: 'Sem conexão exige dupla e as duplas já estão com ' + cap + ' OS em ' + nomeGrupo }));
        distribuirPorRegiao([...(duplaObrigatoria ? [] : sobraDupla), ...entraLivre.filter(o => !comVisitante.has(o))], eqs, cap, opcoes)
          .forEach(o => naoCabe(o, 'Técnicos já estão com ' + cap + ' OS em ' + nomeGrupo));

        const sobras = [];
        for (const e of eqs) {
          while (e.stops.length && !cabe(e)) {
            const ultima = e.paradas[e.paradas.length - 1].os;
            e.stops = e.stops.filter(o => o !== ultima);
            sobras.push({ os: ultima, de: e });
          }
          if (!e.stops.length) sequenciar(e, base, params, viagemMin);
        }
        for (const { os: o, de } of sobras) {
          const candidatos = eqs.filter(e => e !== de && e.stops.length < cap && (!exigeDupla(o) || e.tech.dupla))
            .sort((a, b) => distCentro(a.stops, o) - distCentro(b.stops, o));
          let colocou = false;
          for (const e of candidatos) {
            e.stops.push(o);
            if (cabe(e)) { colocou = true; break; }
            e.stops.pop();
            sequenciar(e, base, params, viagemMin);
          }
          if (!colocou) naoCabe(o, 'Não coube na jornada dos técnicos de ' + nomeGrupo + ' (janela do cliente)');
        }
      }

      for (const e of equipes) {
        if (!e.paradas) sequenciar(e, base, params, viagemMin);
        marcarForaDaRota(e, regioes, params.raioRegiaoKm);

        for (;;) {
          const longe = e.paradas.filter(p => p.foraRota && p.kmFora > params.maxForaRotaKm).sort((a, b) => b.kmFora - a.kmFora)[0];
          if (!longe) break;
          e.stops = e.stops.filter(o => o !== longe.os);
          semTecnico.push({ os: longe.os, motivo: 'Longe das rotas do dia (~' + Math.round(longe.kmFora) + ' km da parada mais próxima)' });
          sequenciar(e, base, params, viagemMin);
          marcarForaDaRota(e, regioes, params.raioRegiaoKm);
        }
      }

      const capDe = setor => setor === 'instalador' ? (params.maxOSInstalador || params.maxOS) : params.maxOS;
      const nfObrigaDupla = [...pool.secoes].some(x => norm(x) === 'nova friburgo');
      const doPool = new Set(pool.itens);
      const encaixaveis = semTecnico
        .filter(x => doPool.has(x.os) && /já estão com|Não coube na jornada|Longe das rotas/.test(x.motivo))
        .sort((a, b) => b.os.score - a.os.score);
      for (const item of encaixaveis) {
        const o = item.os;
        const setores = [o.setor];
        if (ehTransfAssunto(o) && !setores.includes('instalador')) setores.push('instalador');
        if (o.fallbackSetor) setores.push(o.setor === 'instalador' ? 'manutencao' : 'instalador');
        const candidatos = equipes.filter(e => setores.includes(e.tech.setor) && e.stops.length < capDe(e.tech.setor) &&
            !(nfObrigaDupla && e.tech.setor === 'manutencao' && precisaDupla(o) && !e.tech.dupla))
          .map(e => ({ e, d: e.stops.length ? Math.min(...e.stops.map(x => distKm(x, o))) : params.raioRegiaoKm * 0.8,
                       ordemSetor: setores.indexOf(e.tech.setor) }))
          .sort((a, b) => a.ordemSetor - b.ordemSetor || a.d - b.d);
        for (const { e } of candidatos) {
          const antes = new Set(e.paradas ? e.paradas.filter(x => x.foraRota).map(x => x.os) : []);
          e.stops.push(o);
          let ok = cabe(e);
          if (ok) {
            marcarForaDaRota(e, regioes, params.raioRegiaoKm);

            ok = !e.paradas.some(x => x.foraRota && (x.os === o || !antes.has(x.os)));
          }
          if (ok) {
            if (e.tech.setor === 'instalador' && ehTransfAssunto(o)) o.terceiroUltimoCaso = true;
            semTecnico.splice(semTecnico.indexOf(item), 1);
            break;
          }
          e.stops = e.stops.filter(x => x !== o);
          sequenciar(e, base, params, viagemMin);
          marcarForaDaRota(e, regioes, params.raioRegiaoKm);
        }
      }

      melhorarTrocas(equipes, { cabe, capDe, nfObrigaDupla, regioes, raio: params.raioRegiaoKm, base, params, viagemMin });

      for (const e of equipes) rotas.push({ ...e, grupo: nomeGrupo, base });
    }
    return { rotas, semTecnico, foraCampo, fimDeSemana };
  }

  function melhorarTrocas(equipes, ctx) {
    const { cabe, capDe, nfObrigaDupla, regioes, raio, base, params, viagemMin } = ctx;

    const custoRota = e => {
      if (!e.paradas || !e.paradas.length) return 0;
      marcarForaDaRota(e, regioes, raio);
      let km = 0;
      for (let i = 1; i < e.paradas.length; i++) km += distKm(e.paradas[i - 1].os, e.paradas[i].os);
      const visitou = e.stops.filter(o => (o.visitantes || []).some(n => nomeBate(n, e.tech))).length;
      return km + e.foraDaRota * raio - visitou * 1.5;
    };

    const PESO_DIVIDIDO = 5;
    const divididos = setor => {
      const porBairro = {};
      equipes.filter(e => e.tech.setor === setor).forEach((e, i) => e.stops.forEach(o => { (porBairro[chaveBairro(o.bairro)] = porBairro[chaveBairro(o.bairro)] || new Set()).add(i); }));
      return Object.values(porBairro).reduce((s, x) => s + x.size - 1, 0);
    };
    const custo = (a, b) => custoRota(a) + custoRota(b) + PESO_DIVIDIDO * divididos(a.tech.setor);
    const podeSair = () => true;
    const aceita = (o, e) => !(nfObrigaDupla && e.tech.setor === 'manutencao' && precisaDupla(o) && !e.tech.dupla);
    const ajustarVisitante = e => e.stops.forEach(o => { if (o.mesmoTecnico && !nomeBate(o.mesmoTecnico, e.tech)) o.mesmoTecnico = null; });
    const testar = (a, b, novoA, novoB) => {
      const antes = custo(a, b);
      const velhoA = a.stops, velhoB = b.stops;
      a.stops = novoA; b.stops = novoB;
      const ca = cabe(a), cb = cabe(b), depois = (ca && cb) ? custo(a, b) : null;
      if (ca && cb && depois < antes - 0.3) { ajustarVisitante(a); ajustarVisitante(b); return true; }
      a.stops = velhoA; b.stops = velhoB;
      sequenciar(a, base, params, viagemMin); sequenciar(b, base, params, viagemMin);
      marcarForaDaRota(a, regioes, raio); marcarForaDaRota(b, regioes, raio);
      return false;
    };
    for (let volta = 0; volta < 8; volta++) {
      let mexeu = false;
      for (const a of equipes) for (const b of equipes) {
        if (a === b || a.tech.setor !== b.tech.setor) continue;

        const bairrosB = new Set(b.stops.map(o => chaveBairro(o.bairro)));
        for (const chave of [...new Set(a.stops.map(o => chaveBairro(o.bairro)))]) {
          if (!bairrosB.has(chave)) continue;
          const grupo = a.stops.filter(o => chaveBairro(o.bairro) === chave);
          if (grupo.length === a.stops.length && a.stops.length > b.stops.length) continue;
          if (b.stops.length + grupo.length > capDe(b.tech.setor) || !grupo.every(o => aceita(o, b))) continue;
          if (testar(a, b, a.stops.filter(o => !grupo.includes(o)), [...b.stops, ...grupo])) mexeu = true;
        }
        for (const o of a.stops.slice()) {
          if (!a.stops.includes(o) || !aceita(o, b) || !podeSair(o, a)) continue;

          if (b.stops.length < capDe(b.tech.setor) && testar(a, b, a.stops.filter(x => x !== o), [...b.stops, o])) { mexeu = true; continue; }

          for (const p of b.stops.slice()) {
            if (!aceita(p, a) || !podeSair(p, b)) continue;
            if (testar(a, b, [...a.stops.filter(x => x !== o), p], [...b.stops.filter(x => x !== p), o])) { mexeu = true; break; }
          }
        }
      }
      if (!mexeu) break;
    }
    for (const e of equipes) { sequenciar(e, base, params, viagemMin); marcarForaDaRota(e, regioes, raio); }
  }

  const centro = pts => ({ lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length });
  const distCentro = (pts, o) => pts.length ? distKm(centro(pts), o) : 0;

  const precisaDupla = o => /sem conexao/.test(norm(o.assunto));

  function lerRegioes(texto) {
    const lista = [];
    String(texto || '').split(/\r?\n/).forEach(l => {
      const i = l.indexOf('=');
      if (i < 0) return;
      const bairros = l.slice(i + 1).split(';').map(norm).filter(Boolean);
      if (bairros.length) lista.push({ nome: l.slice(0, i).trim(), bairros });
    });
    return lista;
  }
  const regiaoDe = (o, regioes) => regioes.find(z => z.bairros.some(b =>
    norm(o.bairro).includes(b) || (o.regiaoMapa && chaveBairro(o.regiaoMapa.nome) === chaveBairro(b)))) || null;

  function distribuirPorRegiao(itens, equipes, cap, opcoes) {
    const { regioes = [], raio = 5 } = opcoes || {};
    const abertas = equipes.filter(e => e.stops.length < cap);
    if (!itens.length) return [];
    if (!abertas.length) return itens.slice();

    const porChave = new Map();
    for (const o of itens) {
      const z = regiaoDe(o, regioes);

      const k = z ? 'z:' + z.nome : (o.regiaoMapa ? 'm:' + o.regiaoMapa.id : 'o:' + o.id);
      if (!porChave.has(k)) porChave.set(k, { zona: z, itens: [] });
      porChave.get(k).itens.push(o);
    }
    const blocos = [];
    for (const { zona, itens: its } of porChave.values()) {
      const restantes = its.slice();
      while (restantes.length) {
        const pedaco = [restantes.shift()];
        while (pedaco.length < cap && restantes.length) {
          const c = centro(pedaco);
          restantes.sort((a, b) => distKm(c, a) - distKm(c, b));
          pedaco.push(restantes.shift());
        }
        blocos.push({ zona, itens: pedaco, ...centro(pedaco), score: Math.max(...pedaco.map(o => o.score)) });
      }
    }
    blocos.sort((a, b) => b.score - a.score);

    const secao = e => norm(e.tech.secao);
    const afinidade = (e, b) => b.itens.some(o => norm(o.bairro).includes(secao(e)) || (o.regiaoMapa && chaveBairro(o.regiaoMapa.nome) === chaveBairro(e.tech.secao)))
      || (b.zona && b.zona.bairros.some(x => chaveBairro(x) === chaveBairro(e.tech.secao)));

    const chaveReg = b => b.zona ? 'z:' + b.zona.nome : (b.itens[0].regiaoMapa ? 'm:' + b.itens[0].regiaoMapa.id : null);
    const regDasOS = os => { const o = os.find(x => x.regiaoMapa); return o ? 'm:' + o.regiaoMapa.id : null; };

    const centros = abertas.map(e => e.stops.length ? centro(e.stops) : null);
    const regCentro = abertas.map(e => e.stops.length ? regDasOS(e.stops) : null);
    const semeados = new Set();
    abertas.forEach((e, i) => {
      if (centros[i]) return;
      const b = blocos.find(bl => !semeados.has(bl) && afinidade(e, bl));
      if (b) { centros[i] = { lat: b.lat, lng: b.lng }; regCentro[i] = chaveReg(b); semeados.add(b); }
    });

    const qtd = {};
    blocos.forEach(b => { const k = chaveReg(b); if (k) qtd[k] = (qtd[k] || 0) + b.itens.length; });
    for (let i = 0; i < abertas.length; i++) {
      if (centros[i]) continue;
      const ativos = centros.filter(Boolean);
      const longeDe = b => ativos.length ? Math.min(...ativos.map(c => distKm(c, b))) : 0;
      const vagasReg = k => cap * regCentro.filter(x => x === k).length;
      const falta = k => qtd[k] - vagasReg(k);
      const cands = blocos.filter(b => !semeados.has(b) && chaveReg(b) && falta(chaveReg(b)) > 0);
      if (cands.length) {
        const b = cands.sort((x, y) => falta(chaveReg(y)) - falta(chaveReg(x)) || longeDe(y) - longeDe(x))[0];
        centros[i] = { lat: b.lat, lng: b.lng }; regCentro[i] = chaveReg(b); semeados.add(b);
        continue;
      }
      if (!ativos.length) { centros[i] = { lat: blocos[0].lat, lng: blocos[0].lng }; regCentro[i] = chaveReg(blocos[0]); semeados.add(blocos[0]); continue; }
      let longe = null, maior = -1;
      for (const b of blocos) {
        if (semeados.has(b)) continue;
        const d = longeDe(b);
        if (d > maior) { maior = d; longe = b; }
      }
      if (longe && maior > raio) { centros[i] = { lat: longe.lat, lng: longe.lng }; regCentro[i] = chaveReg(longe); semeados.add(longe); }
    }

    let sobra = [];
    const iniciais = abertas.map(e => e.stops.slice());
    for (let it = 0; it < 20; it++) {
      const grupos = iniciais.map(s => s.slice());
      sobra = [];

      const dist = (i, b) => distKm(centros[i], b) - (afinidade(abertas[i], b) ? 1000 : 0) - (regCentro[i] && regCentro[i] === chaveReg(b) ? 2 * raio : 0);
      const ordem = blocos.map(b => {
        const ds = centros.map((c, i) => c ? dist(i, b) : Infinity).sort((a, x) => a - x);
        return { b, arrependimento: (isFinite(ds[1]) ? ds[1] : ds[0]) - ds[0] };
      }).sort((a, x) => x.arrependimento - a.arrependimento);
      for (const { b } of ordem) {
        const pref = centros.map((c, i) => ({ i, d: c ? dist(i, b) : Infinity })).filter(p => isFinite(p.d)).sort((a, x) => a.d - x.d);
        let destino = pref.find(p => grupos[p.i].length + b.itens.length <= cap);
        if (!destino) {

          const livre = abertas.findIndex((e, i) => !centros[i]);
          if (livre >= 0) { centros[livre] = { lat: b.lat, lng: b.lng }; regCentro[livre] = chaveReg(b); destino = { i: livre }; }
        }
        if (destino) { grupos[destino.i].push(...b.itens); continue; }

        for (const o of b.itens) {
          const p = centros.map((c, i) => ({ i, d: c ? distKm(c, o) : Infinity })).filter(x => isFinite(x.d) && grupos[x.i].length < cap).sort((a, x) => a.d - x.d)[0];
          if (p) grupos[p.i].push(o); else sobra.push(o);
        }
      }
      const novos = grupos.map((g, i) => g.length ? centro(g) : centros[i]);
      const mexeu = novos.some((c, i) => c && centros[i] && distKm(c, centros[i]) > 0.05);
      novos.forEach((c, i) => { centros[i] = c; });
      abertas.forEach((e, i) => { e.stops = grupos[i]; });
      if (!mexeu) break;
    }
    return sobra;
  }

  function marcarForaDaRota(e, regioes, raio) {
    const reg = o => { const z = regiaoDe(o, regioes); return z ? { k: 'z:' + z.nome, nome: z.nome } : (o.regiaoMapa ? { k: 'm:' + o.regiaoMapa.id, nome: o.regiaoMapa.nome } : null); };
    const cont = {};
    e.paradas.forEach(p => { const r = reg(p.os); if (r) cont[r.k] = (cont[r.k] || { n: 0, nome: r.nome }), cont[r.k].n++; });
    const principal = Object.entries(cont).sort((a, b) => b[1].n - a[1].n)[0];
    e.foraDaRota = 0;
    for (const p of e.paradas) {
      const r = reg(p.os);
      const outraRegiao = principal && r && r.k !== principal[0];

      const outras = e.paradas.filter(x => x !== p && (!outraRegiao || (reg(x.os) || {}).k === principal[0])).map(x => x.os);
      const km = outras.length ? Math.min(...outras.map(o => distKm(o, p.os))) : 0;
      p.kmFora = km;
      if (outraRegiao || (outras.length && km > raio)) {
        p.foraRota = 'Fora da rota: ' + (outraRegiao ? r.nome + ' (rota em ' + principal[1].nome + ')' : 'longe das outras paradas') + ' · ~' + Math.round(km) + ' km da parada mais próxima';
        e.foraDaRota++;
      } else p.foraRota = '';
    }
  }

  const horaMinima = o => o.pref.aPartir != null ? o.pref.aPartir : (o.pref.janela === 'tarde' ? 13 * 60 : null);

  function sequenciar(e, base, params, viagemMin) {
    const restantes = e.stops.slice();
    const ordem = [];
    let atual = base || restantes[0], relogio = e.inicio, almocoSim = false;
    while (restantes.length) {
      const opc = restantes.map(o => {
        const chegada = relogio + viagemMin(atual ? distKm(atual, o) : 0);
        const min = horaMinima(o);
        return { o, chegada, d: atual ? distKm(atual, o) : 0, pode: min == null || min <= chegada + 15, min };
      });
      const podem = opc.filter(x => x.pode);
      let esc;
      if (podem.length) {
        const manha = podem.filter(x => x.o.pref.janela === 'manha' && x.chegada < 12 * 60);
        esc = (manha.length ? manha : podem).sort((a, b) => a.d - b.d)[0];
      } else {
        esc = opc.sort((a, b) => a.min - b.min || a.d - b.d)[0];
      }
      let t = esc.chegada;
      if (!almocoSim && t >= 12 * 60) { t += params.almocoMin; almocoSim = true; }
      if (esc.min != null && t < esc.min) t = esc.min;
      relogio = t + esc.o.dur;
      restantes.splice(restantes.indexOf(esc.o), 1);
      ordem.push(esc.o);
      atual = esc.o;
    }
    let t = e.inicio, almocou = false, pos = base, km = 0;
    e.paradas = ordem.map(o => {
      const d = pos ? distKm(pos, o) : 0;
      km += d;
      t += viagemMin(d);
      let espera = 0;
      const minimo = horaMinima(o);
      if (!almocou && t >= 12 * 60) { t += params.almocoMin; almocou = true; }

      if (minimo != null && t < minimo) { espera = pos === base ? 0 : minimo - t; t = minimo; }
      const chegada = t;
      t += o.dur;
      pos = o;
      const alerta = o.pref.janela === 'manha' && chegada > 12 * 60 ? 'Cliente pediu manhã' : (t > e.fim ? 'Passa do fim da jornada' : '');
      return { os: o, chegada: hhmm(chegada), saida: hhmm(t), fimMin: t, espera, alerta };
    });
    e.km = km;
    e.termino = hhmm(t);
    e.stops = ordem;
  }

  const api = { nomeBate, norm, parseDataBR, assuntoEhDeCampo, lerMapaRegioes, indiceMapa, localizarNoMapa, montarOS, aplicarHistorico, planejar, lerPreferencia, tipoServico, distKm, hhmm, PADRAO_PARAMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Motor = api;
})(this);

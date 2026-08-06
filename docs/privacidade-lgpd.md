# Privacidade e LGPD

## O que o sistema armazena hoje

A partir da v0.1, o COP Analytics passou a importar, além de dados operacionais
(status, datas, eventos, diagnósticos), dois campos de identificação do
cliente vindos de Ordens.xlsx: **cliente** (nome) e **login**. O login é a
chave usada para calcular recorrência, porque um mesmo cliente pode ter mais
de um login e o nome digitado pode variar entre OS.

Nome e login de cliente são **dados pessoais** na definição da LGPD (Lei
13.709/2018). A partir de agora, qualquer decisão de arquitetura que envolva
essas duas colunas precisa considerar isso.

## Como os dados são tratados hoje

- **Tudo roda no navegador.** Não existe backend, API ou servidor no COP
  Analytics hoje — o Excel é lido inteiramente no lado do cliente
  (JavaScript), e nenhum dado é enviado para fora da máquina de quem importou
  o arquivo.
- **Persistência é local.** O que foi importado fica salvo no IndexedDB do
  navegador (implementado em `js/services/armazenamento.js`), que também é
  local à máquina — não sincroniza com nenhum servidor.
- **Sem transmissão de rede.** Não há chamada de rede em nenhum ponto do
  fluxo de importação/processamento atual.

Isso significa que, na arquitetura atual, dado de cliente nunca sai da
máquina de quem está usando o sistema — o que é uma vantagem de privacidade
em relação a uma solução com backend centralizado, mas **não elimina** a
responsabilidade sobre esses dados: eles ainda ficam armazenados em texto
puro no disco de quem usa o navegador.

## Pontos de atenção para quando o projeto virar SaaS

O roadmap do projeto prevê o COP Analytics evoluindo para uma plataforma SaaS
multi-empresa. Nesse momento, os dados deixam de ficar só na máquina do
usuário e passam a trafegar/ficar armazenados em um servidor compartilhado
entre clientes (provedores de internet). Isso muda completamente o cenário de
risco e exige, no mínimo:

1. **Criptografia em trânsito e em repouso** para os campos `cliente` e
   `login` (e qualquer outro dado pessoal que vier a ser importado).
2. **Isolamento entre empresas** (multi-tenancy) — dados de um provedor nunca
   podem vazar para outro.
3. **Controle de acesso** — nem todo usuário do sistema precisa enxergar
   nome/login de cliente; times que só olham indicadores agregados
   (dashboards, MTTR, SLA) podem trabalhar com dados anonimizados.
4. **Base legal e finalidade** — documentar por que o dado é coletado
   (no caso, detectar recorrência de chamados) e por quanto tempo é retido.
5. **Anonimização para análises agregadas** — sempre que possível, cálculos
   de indicador (não ligados a um cliente específico) devem rodar sobre
   dados anonimizados/pseudonimizados.

Nada disso precisa ser resolvido agora — a arquitetura atual (100%
client-side) já é razoavelmente segura para o uso interno de hoje. Este
documento existe para que a decisão de ir para SaaS não comece do zero em
relação a privacidade.

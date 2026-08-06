# Privacidade e LGPD

## O que o sistema armazena hoje

O COP Analytics importa, além de dados operacionais (status, datas, eventos,
diagnósticos), dois campos de identificação do cliente vindos de Ordens.xlsx:
**cliente** (nome) e **login**. O login é a chave usada para calcular
recorrência, porque um mesmo cliente pode ter mais de um login e o nome
digitado pode variar entre OS. Também importa nome e setor de operadores
(Base.xlsx) — dado pessoal de colaborador, não só de cliente.

Nome/login de cliente e nome/setor de operador são **dados pessoais** na
definição da LGPD (Lei 13.709/2018). Qualquer decisão de arquitetura que
envolva essas colunas precisa considerar isso.

## Como os dados são tratados hoje

> **Mudança de arquitetura**: até a v0.x anterior, o sistema era 100%
> client-side (sem backend, dado nunca saía do navegador). A partir da
> introdução de login com papéis e dados compartilhados entre a equipe, isso
> deixou de valer — o dado agora vive num banco compartilhado na nuvem. Veja
> abaixo o que mudou de fato.

- **Backend**: [Supabase](https://supabase.com) (Postgres gerenciado +
  Autenticação + Row Level Security), projeto hospedado na região **São
  Paulo (sa-east-1)** — dado fica no Brasil.
- **Autenticação obrigatória**: sem login, nada do sistema é visível (só a
  tela de entrada — ver `js/ui/login.js`). Sem autocadastro: contas são
  criadas manualmente no painel do Supabase.
- **Dois papéis de acesso**:
  - `admin` — importa, apaga, faz tudo.
  - `leitor` — só pesquisa/analisa; não importa nem apaga nada. Essa
    restrição não é só de interface: é aplicada como política de **Row Level
    Security** no próprio banco (`database/schema-supabase.sql`), então uma
    tentativa de escrita direta (fora da tela) também é recusada.
- **O que é compartilhado**: Base.xlsx e Ordens.xlsx importados por um
  `admin` ficam visíveis pra todo mundo com conta no sistema — inclusive
  nome/login de cliente e nome/setor de operador. Não existe hoje segregação
  por empresa/equipe (single-tenant): todo usuário autenticado enxerga o
  mesmo conjunto de dados.
- **Sem transmissão pra terceiros além do Supabase**: o Excel ainda é lido
  inteiramente no navegador (JavaScript, `xlsx.full.min.js`); só o resultado
  já processado é que vai pro banco, via chamadas HTTPS diretas do navegador
  pra API do Supabase.

## Pontos de atenção com a arquitetura atual

1. **Dado de cliente/operador agora sai da máquina de quem importa** — fica
   num banco gerenciado por terceiro (Supabase), ainda que hospedado no
   Brasil e protegido por autenticação + RLS. Isso é uma mudança real de
   superfície de risco em relação à versão anterior.
2. **Todo usuário logado vê tudo** — não há hoje um papel intermediário que
   veja só indicadores agregados sem nome/login de cliente. Se isso vier a
   ser necessário, dá pra criar uma "view" no Postgres que omite essas
   colunas e liberar esse papel só nela.
3. **Retenção**: os dados ficam no banco até alguém com papel `admin` usar
   "Limpar dados" (que agora apaga pra todo mundo, não só localmente) — não
   há expiração automática configurada.
4. **Base legal e finalidade**: seguem sendo os mesmos do uso original —
   detectar recorrência de chamados e medir desempenho operacional
   (TMS/TMA/TMR/TME) — não houve mudança de finalidade, só de onde o dado
   fica guardado.
5. **Auditor IA** (quando ativado): o histórico de uma OS é enviado a um
   provedor de IA externo através de uma Edge Function do Supabase — a
   chave de API fica só no servidor, nunca no navegador, mas o conteúdo da
   OS (que pode incluir nome/login de cliente) passa a trafegar até esse
   terceiro também.

## Se o projeto virar SaaS multi-empresa

O ponto 2 acima passa a ser obrigatório nesse cenário: isolamento entre
empresas (multi-tenancy) via RLS adicional (coluna de empresa + política
comparando com o usuário logado), pra dados de um provedor nunca vazarem
para outro.

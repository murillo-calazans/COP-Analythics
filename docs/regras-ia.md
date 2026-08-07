# Auditor IA — regras e decisões

## O que é

Avaliação qualitativa de uma OS individual, feita por um modelo de IA
(Google Gemini — `gemini-2.0-flash`, gratuito) a partir do histórico
completo de movimentações — não é uma métrica calculada, é um
julgamento de texto.

## Onde roda

Edge Function do Supabase: `supabase/functions/auditor-ia/index.ts`. A
chave da API (`GEMINI_API_KEY`, gerada em aistudio.google.com/apikey)
fica só nas variáveis de ambiente da function — nunca chega no
navegador. Ver `js/services/auditoriaia.js` (chamada do lado do app) e
`js/ui/timeline.js` (botão + exibição, dentro do modal de detalhe da OS).

Gemini foi escolhido especificamente por ter camada gratuita sem
precisar de cartão de crédito — dá conta do uso esperado aqui (análise
manual, uma OS por vez, disparada só por admin).

## Quem pode fazer o quê

- **Ver o resultado já salvo**: qualquer usuário logado (admin ou
  leitor) — mesma regra de leitura das outras tabelas.
- **Disparar uma análise nova**: só `admin`. Cada chamada tem custo real
  de API, então fica restrito a quem também controla a importação de
  dados. A checagem é feita dentro da própria Edge Function (consulta a
  tabela `perfis`), não só escondendo o botão na tela — então não dá pra
  burlar chamando a function direto.

## O que o modelo avalia

Recebe o histórico cronológico completo da OS (evento, operador, status,
diagnóstico, resposta padrão, mensagem e histórico de cada movimentação,
com os códigos já resolvidos pra nome) e responde três perguntas:

1. O diagnóstico registrado é coerente com o histórico (mensagens,
   respostas padrão, eventos)?
2. O tempo entre abertura e fechamento parece razoável pro tipo de
   assunto?
3. Existe algo no histórico que sugira atendimento malfeito, incompleto,
   ou diagnóstico genérico/errado?

## Formato da resposta

Veredito estruturado, forçado via tool use da API da Anthropic (não é
texto livre parseado na mão):

```json
{
  "veredito": "ok" | "questionavel" | "problematico",
  "justificativa": "2-4 frases explicando o motivo",
  "avaliadoEm": "timestamp ISO de quando rodou"
}
```

Guardado em `ordens.auditoria_ia` (jsonb). `null` = ainda não avaliada.

## O que NÃO faz (por enquanto)

- Não roda automaticamente na importação — é sempre um clique manual do
  admin, por OS.
- Não tem visão de lista/painel agregado (ex.: "todas as OS com veredito
  problemático") — pra ver o resultado, precisa abrir a OS específica.
  Pode ser um próximo passo se fizer falta.
- Não reavalia sozinha quando a OS muda depois (reaberta, novo
  fechamento) — rodar de novo é decisão manual do admin.

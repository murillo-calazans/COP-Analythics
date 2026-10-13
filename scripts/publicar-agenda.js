/**
 * Publica a agenda do dia seguinte sozinha (Agenda IA).
 *
 * Roda pela rotina do GitHub (.github/workflows/publicar-agenda.yml) todo
 * dia às 17h de Brasília, ou à mão:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/publicar-agenda.js [--data=AAAA-MM-DD] [--simular]
 *
 * --simular: gera e mostra o resumo, sem gravar.
 * A lógica fica em js/agendador/publicar-agenda.js (a mesma do site).
 */
const path = require("path");

const raiz = path.join(__dirname, "..");
const mods = {
    Motor: require(path.join(raiz, "js/agendador/motor.js")),
    EscalaDia: require(path.join(raiz, "js/agendador/escala-dia.js")),
    AgendaPublicacao: require(path.join(raiz, "js/agendador/agenda-publicacao.js"))
};
const { publicarAgenda } = require(path.join(raiz, "js/agendador/publicar-agenda.js"));

const args = process.argv.slice(2);
const data = (args.find(a => a.startsWith("--data=")) || "").slice("--data=".length) || null;
const simular = args.includes("--simular");
const url = process.env.SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_KEY;

if (!url || !chave) {
    console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_KEY (segredos da rotina no GitHub).");
    process.exit(1);
}
if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    console.error(`--data inválida: ${data} (use AAAA-MM-DD)`);
    process.exit(1);
}

const inicio = Date.now();
publicarAgenda({ url, chave, data, simular, mods })
    .then(r => {
        const { amostra, ...resumo } = r;
        console.log(JSON.stringify(resumo, null, 2));
        if (r.status === "mantida") console.log(`Agenda de ${r.data} não foi alterada: ${r.motivo}.`);
        else console.log(`Agenda de ${r.data} ${r.status}: ${r.agendadas} OS com ${r.tecnicos} equipes, ${r.semTecnico} não couberam (${((Date.now() - inicio) / 1000).toFixed(0)} s).`);
    })
    .catch(e => {
        console.error("Falhou ao publicar a agenda: " + (e && e.message || e));
        process.exit(1);
    });

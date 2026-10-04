// Crea dist-anteprima/salvadanaio.html: l'app in un unico file HTML, con i dati di esempio
// caricati all'avvio. Utile per condividere un'anteprima senza installare nulla.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist-anteprima';
execSync(`npx vite build --outDir ${out}/build --emptyOutDir`, {
  stdio: 'inherit',
  env: { ...process.env, VITE_AVVIO_DEMO: '1' },
});

const assets = join(out, 'build', 'assets');
const files = readdirSync(assets);
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const favicon = `data:image/svg+xml;base64,${readFileSync('public/favicon.svg').toString('base64')}`;

const html = `<title>Salvadanaio</title>
<link rel="icon" href="${favicon}" type="image/svg+xml" />
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js.replaceAll('./favicon.svg', favicon).replace(/<\/script/gi, '<\\/script')}
</script>
`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'salvadanaio.html'), html);
console.log(`${out}/salvadanaio.html (${Math.round(html.length / 1024)} kB)`);

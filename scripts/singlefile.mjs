// Gera um HTML de arquivo único (CSS e JS embutidos) que roda direto do file://.
// Uso: npm run build && npm run single
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "release", "CRIPTA DO NÚCLEO RUBRO (jogo único).html");

const html = readFileSync(join(DIST, "index.html"), "utf8");
const assets = readdirSync(join(DIST, "assets"));

const cssFile = assets.find(f => f.endsWith(".css"));
const jsFile = assets.find(f => f.endsWith(".js"));
if (!cssFile || !jsFile) throw new Error("CSS/JS não encontrados em dist/assets");

const css = readFileSync(join(DIST, "assets", cssFile), "utf8");
const js = readFileSync(join(DIST, "assets", jsFile), "utf8");

// Aviso: não usar .replace("</body>", "<script>..." + js + "...") com string,
// pois String.replace interpreta padrões "$&", "$'", "$`", "$1" etc. dentro do
// JS embutido (o bundle minificado contém "$&" etc.), corrompendo o código.
// Função de substituição devolve o texto literal sem processar padrões "$".
const result = html
  .replace(/<script type="module"[^>]*><\/script>\s*/, "")
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`)
  .replace("</body>", () => `<script>\n${js}\n</script>\n</body>`);

writeFileSync(OUT, result, "utf8");
console.log(`OK -> ${OUT} (${(result.length / 1024).toFixed(0)} kB)`);

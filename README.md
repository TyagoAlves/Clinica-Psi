# Clínica Psi — Prontuário Eletrônico

Prontuário eletrônico para clínicas psicológicas: agenda, evolução, termos de
consentimento LGPD e relatórios. O mesmo frontend React serve dois alvos:

- **app empacotado** (Tauri + Rust), com os dados em SQLite;
- **versão web** (Vite), que é o que a suíte Playwright exercita.

## Funcionalidades

- Agenda do dia, com sessões, conflitos, impressão em PDF e.notas.
- Prontuário por paciente: evoluções, termos LGPD e dados de contato.
- Relatórios de produção e termo assinado.
- **Acesso com senha guardada em hash** (PBKDF2, via WebCrypto). A senha em
  claro do seed é o que se digita no primeiro acesso; o que fica gravado é o
  derivado. Restaurar um backup exige redigitar a senha atual.
- **Cadastro em dois passos** e o painel "Meu acesso", onde cada profissional
  troca a própria senha.
- **Configurações compartilháveis**: exporta/importa só a identidade, a marca,
  os textos e os modelos de termo — sem nenhum dado de paciente, nem
  senha.
- Abas restritas por permissão dentro de Configurações: quem não administra
  entra na tela, mas só enxerga "Meu acesso" e "Dados".
- Exportação dos dados que cada profissional registrou, recortado pela LGPD.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind 4 · Tauri 2 (Rust) · SQLite (rusqlite)
· Oxlint · Playwright

## Como rodar

```bash
npm install

npm run desktop         # app empacotado, com hot reload
npm run desktop:build   # gera o instalador NSIS

npm run dev             # sobe a versao web em :5173
npm run build           # build do frontend
npm run typecheck       # tsc -b
npm run lint            # oxlint
npm run test:all        # Playwright
```

Pré-requisitos para o build desktop: Rust stable, MSVC Build Tools com
`VCTools` e Windows SDK. WebView2 já vem no Windows 10/11.

O instalador sai em `src-tauri/target/release/bundle/nsis/`.

## Persistência

A porta `StorageAdapter` (`src/adapters/StoragePort.ts`) é chave-valor, e a
implementação é escolhida em `src/adapters/index.ts`:

| alvo | adapter | onde os dados ficam |
|---|---|---|
| app empacotado | `SqliteAdapter` | `%APPDATA%\br.com.clinicapsi.prontuario\clinica-psi.db` |
| web | `LocalStorageAdapter` | `localStorage` |

Por que SQLite no app empacotado, e não `localStorage`:

- **sem teto de ~5 MB por origem** — o limite que aperta num prontuário com
  evoluções em HTML;
- **escrita atômica** — WAL + `synchronous=FULL`, então uma falha no meio de
  um `setAll` não deixa a coleção truncada;
- **os dados ficam num arquivo** que dá para copiar, em vez de presos no
  perfil do WebView2.

A migração preservou a porta: os oito repositórios e o domínio não mudaram.
Como a interface já era `get(key)/set(key, value)`, o SQLite entra como tabela
`kv(key, value, updated_at)` — chave-valor, não relacional. Consultas
relacionais só fazem sentido quando houver sincronização entre máquinas.

O `store` do zustand (`src/store/index.ts`) continua em `localStorage` de
propósito: é estado de sessão e UI, não dado clínico.

O prefixo `clinica-psi-` é mantido nos dois adapters, então as chaves ficam
idênticas entre o app empacotado e a web.

### Backup

O backup é montado chave a chave em `src/services/DataService.ts` e, no app
empacotado, o destino sai do diálogo nativo do sistema (não mais a pasta de
Downloads do WebView2). Na web continua o download do navegador.

## Roteamento

`App.tsx` escolhe o router por ambiente: `HashRouter` no app empacotado, onde
o frontend é servido por `tauri://localhost` e não há fallback de rota —
recarregar em `/patients` daria 404. Na web segue `BrowserRouter`, que é o que
os testes usam com `page.goto('/rota')`.

## CI

`.github/workflows/ci.yml`: typecheck, lint, build e testes em Ubuntu; o build
do instalador roda em `windows-latest` e sobe o `.exe` como artefato. Não há
deploy de GitHub Pages — o alvo principal é o app empacotado.

## Estado do repositório

Isto é o fork empacotado. O app de navegador continua em
`TyagoAlves/Prontuario-para-Psiclogos`, de onde vêm as funcionalidades; aqui
eles convivem com o Tauri e o SQLite.

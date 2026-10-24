# Procedência desta skill (vendored)

Esta pasta é uma cópia da skill **Taste Skill** (`design-taste-frontend`),
versionada dentro do projeto para ficar disponível em toda sessão do Claude Code
(inclusive nas sessões de nuvem, que clonam o repositório a cada início).

- **Origem:** https://github.com/Leonxlnx/taste-skill (pasta `skills/taste-skill/`)
- **Plugin/versão:** taste-skill v2.1.4
- **Commit de origem:** 6010f91a9935f1c167dfc500fb1a475681892e6b
- **Licença:** MIT (ver `LICENSE` nesta pasta)
- **Copiada em:** 2026-10-24

## Observações
- Os arquivos foram **apenas copiados**; nenhum script (`scripts/*.mjs`,
  `install.sh`) foi executado durante a instalação.
- Os scripts da skill (`draw.mjs`, `inspect.mjs`, `assets.mjs`) são executados
  somente **sob demanda**, quando a skill for usada. Eles exigem **Node 22+** e
  um navegador **Chrome/Edge/Chromium** instalado, e o `assets.mjs` precisa de
  **acesso à internet** (baixa imagens de domínio público — sem API keys).
- A saída de trabalho da skill é gravada em `.taste-skill/` na raiz do projeto
  (ignorada pelo `.gitignore`, não versionada).

## Como atualizar
Rebaixar a pasta `skills/taste-skill/` do repositório oficial e substituir o
conteúdo desta pasta (mantendo este `VENDORED.md`).

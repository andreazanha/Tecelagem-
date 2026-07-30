# Contrato de dados — Lojas parceiras (Onde Encontrar)

O site (`onde-encontrar.html`) lê o arquivo **`lojas.json`**, na mesma pasta, ao carregar.
O **CRM** deve gerar/atualizar esse arquivo. É público, só leitura (sem senha).

## Formato

Um array JSON. Cada loja é um objeto com estes campos:

```json
[
  {
    "uf": "SP",
    "cidade": "São Paulo",
    "nome": "Casa Aconchego Decorações",
    "endereco": "Rua dos Pinheiros, 123 · Pinheiros · São Paulo/SP · 05422-000",
    "instagram": "casaaconchego",
    "whatsapp": "5511999990001"
  }
]
```

### Campos

| Campo       | Obrigatório | Formato / observação                                                        |
|-------------|-------------|------------------------------------------------------------------------------|
| `uf`        | sim         | Sigla do estado em maiúsculas: `SP`, `RJ`, `MG`… (2 letras)                  |
| `cidade`    | sim         | Nome da cidade. Lojas da mesma cidade são agrupadas juntas.                  |
| `nome`      | sim         | Nome da loja (título do card).                                              |
| `endereco`  | recomendado | Endereço completo, uma linha. Sugestão de separador: ` · `                   |
| `instagram` | opcional    | Só o usuário, sem `@` e sem URL (ex.: `casaaconchego`). Vazio = sem botão.  |
| `whatsapp`  | opcional    | Só números, com DDI 55 (ex.: `5511999990001`). Vazio = sem botão.           |

### Regras que o site aplica sozinho

- Aceita variações de nome de campo: `estado`/`uf`, `loja`/`nome`, `insta`/`instagram`, `whats`/`telefone`/`whatsapp`.
- Limpa o Instagram automaticamente (tira `@` e `https://instagram.com/`).
- Limpa o WhatsApp automaticamente (mantém só dígitos).
- Ignora lojas sem `nome` ou com `uf` inválida.
- No mapa, só "acendem" os estados que têm ao menos uma loja.
- Se o `lojas.json` não existir ou falhar, o site usa uma lista de exemplo embutida (nunca quebra).

## Onde publicar

`lojas.json` na raiz do site (mesma pasta do `onde-encontrar.html`).
No GitHub Pages fica acessível em `…/Tecelagem-/lojas.json`.

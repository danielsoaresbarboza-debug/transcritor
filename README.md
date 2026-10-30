# Transcritor

App Android que transforma os vídeos de um perfil do Instagram em texto.

1. Digite o @ (ou compartilhe um perfil/reel do Instagram com o app).
2. Escolha os vídeos.
3. Receba a descrição e a transcrição do áudio de cada um, num arquivo `.md` pronto para mandar ao Claude.

A transcrição roda no próprio celular com o Whisper (via Transformers.js). Não usa API paga.

## Instalar

Abra a [última versão](../../releases/latest), baixe **Transcritor.apk** e toque nele.
Na primeira vez, o Android pede para permitir a instalação de "fontes desconhecidas".

## Como é montado

Cada envio para a branch `main` monta o APK automaticamente pelo GitHub Actions e publica uma nova versão em *Releases*.

- `app/src/main/assets/web/` — telas do app (HTML, CSS e JS) e o worker do Whisper
- `app/src/main/java/` — a casca Android: WebView, login no Instagram, compartilhar e salvar arquivos

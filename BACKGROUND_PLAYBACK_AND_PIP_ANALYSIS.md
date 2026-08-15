da 

# Diagnóstico Técnico: Reprodução em Segundo Plano, PiP e Controles de Mídia no GeckoView

## 1. Histórico e Tentativas Anteriores

Para evitar redundância e ciclos repetitivos de desenvolvimento, este documento registra detalhadamente todas as abordagens testadas, os comportamentos observados e as limitações de cada uma.

---

### Tentativa 1: Escuta Agressiva no Evento `pause` do `<video>`

- **Abordagem**:
  Listener adicionado diretamente no elemento `<video>`:
  `video.addEventListener('pause', () => setTimeout(video.play, 25))`
- **Resultado Positivo**: O vídeo continuava tocando em segundo plano mesmo com tela apagada ou app minimizado.
- **Efeito Colateral Crítico**: Bloqueou 100% das pausas manuais. O usuário não conseguia pausar o vídeo em nenhuma interface (nem no player, nem na notificação, nem na ilha do HyperOS), pois qualquer pausa disparava um `play()` automático 25ms depois.

---

### Tentativa 2: Guarda de Interação do Usuário (`allowPauseUntil`)

- **Abordagem**:
  Escuta de eventos `pointerdown`/`touchstart` (`e.isTrusted === true`) para abrir uma janela de 600ms permitindo a execução de `HTMLMediaElement.prototype.pause()`. Chamadas de `pause()` fora dessa janela eram descartadas.
- **Resultado**:
  No ambiente móvel do YouTube, cliques em botões do player são processados por múltiplos wrappers de eventos e renderers Polymer/CustomElements. O evento de toque nem sempre coincidia com a chamada direta de `pause()` no frame do vídeo, ou comandos vindos da interface do sistema (PiP e notificação) não passavam na verificação de toque com `isTrusted`.
- **Efeito Colateral**: O botão de pause falhava em algumas interfaces ou o vídeo ficava travado.

---

### Tentativa 3: Congelamento da Page Visibility API via `exportFunction` e `wrappedJSObject`

- **Abordagem**:
  Modificação de `Document.prototype.hidden` (sempre `false`), `Document.prototype.visibilityState` (sempre `'visible'`) e supressão dos eventos `visibilitychange`, `pagehide`, `blur`, `freeze` exportando funções para o contexto real da página GeckoView.
- **Resultado Positivo**: O botão de Play e Pause voltou a funcionar normalmente em todas as interfaces.
- **Comportamento Observado**: O YouTube Mobile ainda detecta perda de foco/viewport por canais adicionais (ex: temporizadores internos vinculados ao `requestAnimationFrame`, `IntersectionObserver` do contêiner ou suspensão de decodificador pelo Android SurfaceView/GeckoView ao perder visibilidade de tela).

---

## 2. Estudo de Arquitetura: Botões do Pop-up PiP

### Requisitos Solicitados

1. **Botão de Fone de Ouvido (Modo Somente Áudio em Segundo Plano)**:
   - Posicionado no local do botão de retorno/navegação.
   - **Comportamento**: Fecha/minimiza a janela flutuante (PiP) e mantém o áudio tocando continuamente em segundo plano, integrado à Ilha HyperOS e à notificação de mídia do Android.
2. **Botão de Fechar (X)**:
   - **Comportamento**: Pausa o vídeo (`executePlayerCommand("PAUSE")`) e encerra o pop-up PiP simultaneamente.

---

### Como o Android PiP Gerencia Botões Customizados

No Android 8.0+ (API 26+), a janela de Picture-in-Picture nativa suporta até **3 `RemoteAction`s** customizadas definidas via `PictureInPictureParams.Builder.setActions(List<RemoteAction>)`:

```kotlin
// Estrutura de Ações para a Janela PiP
val actions = ArrayList<RemoteAction>()

// 1. Ação Fone de Ouvido (Áudio em Segundo Plano)
val audioIntent = PendingIntent.getBroadcast(
    context, 
    REQUEST_CODE_AUDIO_ONLY, 
    Intent(ACTION_PIP_AUDIO_ONLY), 
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
)
val audioAction = RemoteAction(
    Icon.createWithResource(context, R.drawable.ic_headphones),
    "Áudio em Segundo Plano",
    "Áudio em Segundo Plano",
    audioIntent
)
actions.add(audioAction)

// 2. Ação Play / Pause
val playPauseIntent = PendingIntent.getBroadcast(
    context, 
    REQUEST_CODE_PLAY_PAUSE, 
    Intent(ACTION_PIP_PLAY_PAUSE), 
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
)
val playPauseIcon = if (isMediaPlaying) R.drawable.ic_pause else R.drawable.ic_play
val playPauseAction = RemoteAction(
    Icon.createWithResource(context, playPauseIcon),
    if (isMediaPlaying) "Pausar" else "Reproduzir",
    if (isMediaPlaying) "Pausar" else "Reproduzir",
    playPauseIntent
)
actions.add(playPauseAction)

// 3. Ação Fechar com Pausa
val closePauseIntent = PendingIntent.getBroadcast(
    context, 
    REQUEST_CODE_CLOSE_AND_PAUSE, 
    Intent(ACTION_PIP_CLOSE_AND_PAUSE), 
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
)
val closeAction = RemoteAction(
    Icon.createWithResource(context, R.drawable.ic_close),
    "Pausar e Fechar",
    "Pausar e Fechar",
    closePauseIntent
)
actions.add(closeAction)

// Atualização dos parâmetros PiP
val pipParams = PictureInPictureParams.Builder()
    .setActions(actions)
    .build()
setPictureInPictureParams(pipParams)
```

---

### Fluxo de Execução dos Botões

```
[Usuário toca na Janela PiP]
       │
       ├── Botão Fone de Ouvido  --> Minimiza a janela PiP (moveTaskToBack) + mantém PlaybackService ativo
       ├── Botão Play / Pause    --> Alterna reprodução (executePlayerCommand PLAY_PAUSE)
       └── Botão Fechar (X)      --> Pausa o vídeo (executePlayerCommand PAUSE) + fecha o pop-up PiP
```

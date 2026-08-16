# YouTube Kiosk Browser

[![Android](https://img.shields.io/badge/Platform-Android%208.0%2B-green.svg)](https://developer.android.com)
[![GeckoView](https://img.shields.io/badge/Engine-Mozilla%20GeckoView%20128-blue.svg)](https://mozilla.github.io/geckoview/)
[![Kotlin](https://img.shields.io/badge/Language-Kotlin%201.9-orange.svg)](https://kotlinlang.org)
[![Architecture](https://img.shields.io/badge/Arch-ARM64--v8a-lightgrey.svg)](https://developer.android.com/ndk/guides/abis)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

Navegador Android dedicado e de alta performance para YouTube, construído sobre o motor **Mozilla GeckoView 128**. Projetado especificamente para uso contínuo em tablets, displays automotivos, quiosques e smartphones, oferecendo reprodução contínua em segundo plano com tela desligada, aniquilador de anúncios de latência zero, motor nativo do SponsorBlock e integração total com a **Ilha Dinâmica do Xiaomi HyperOS** e central de controle do Android.

---

## Recursos Principais

### 1. Reprodução Contínua em Segundo Plano e Tela Desligada
- Mantém o áudio do vídeo tocando ininterruptamente ao minimizar o aplicativo ou desligar a tela.
- **Guarda Temporal de Hardware (`dispatchTouchEvent`)**: Algoritmo que intercepta eventos de toque na camada física do display para distinguir perfeitamente entre um toque intencional do usuário no botão de pausa e uma suspensão de ciclo de vida imposta pelo sistema operacional.

### 2. Aniquilador de Anúncios com Latência Zero (0ms)
- Identifica e suprime anúncios in-stream no momento exato em que são injetados pelo player.
- Executa em 0ms sem recorrer a extensões pesadas que atrasam a inicialização dos vídeos.
- Limpeza estática de banners promocionais e cards de anúncios no DOM.

### 3. Motor Nativo do SponsorBlock
- Conecta-se diretamente à API REST pública oficial do SponsorBlock (`https://sponsor.ajay.app`).
- Pula automaticamente segmentos marcados pela comunidade em menos de 150ms:
  - Patrocínios pagos e leituras de parceiros (`sponsor`)
  - Aberturas e vinhetas (`intro`)
  - Telas finais e encerramentos (`outro`)
  - Divulgação de produtos próprios (`selfpromo`)
  - Pedidos de like e inscrição (`interaction`)

### 4. Sincronização em Tempo Real com a Ilha Dinâmica HyperOS e Notificações
- Rastreamento completo de navegação SPA (Single Page Application via `onLocationChange`).
- **Cache de Imagens LRU (20 slots)** e pré-carregamento de miniaturas em alta resolução (`hqdefault.jpg`), garantindo exibição instantânea sem atrasos e sem fallback para o ícone do app.
- Controles de mídia nativos completos (Play, Pause, Próximo, Anterior, Barra de Progresso e Seek).

### 5. Modo Picture-in-Picture (PiP) Flutuante
- Janela flutuante redimensionável com isolamento automático de CSS.
- Oculta menus, comentários e barras de ferramentas ao entrar em PiP, exibindo apenas o vídeo em tela cheia com aceleração por hardware.

### 6. Otimização de Armazenamento (-50%)
- Filtragem nativa de ABI para processadores 64-bit (`arm64-v8a`).
- Execução direta de binários C++ via memória (`android:extractNativeLibs="false"`), reduzindo o uso de armazenamento em disco de ~320 MB para ~170 MB.

---

## Arquitetura do Sistema

O fluxo de dados entre o motor web, o sistema operacional Android e os serviços de mídia opera da seguinte forma:

```
+-----------------------------------------------------------------------+
|                         YouTube Web (DOM)                             |
|  - Injeção de Visibilidade (document.hidden = false)                  |
|  - Aniquilador de Anúncios (0ms) & Motor SponsorBlock                 |
|  - WebExtension Content Script (content.js)                           |
+-----------------------------------+-----------------------------------+
                                    |
                            (GeckoView IPC)
                                    |
+-----------------------------------v-----------------------------------+
|                     PlaybackSessionManager (Kotlin)                   |
|  - Guarda Temporal de Toque por Hardware (dispatchTouchEvent)         |
|  - Rastreamento de URLs SPA (NavigationDelegate.onLocationChange)     |
|  - Pré-carregamento de Miniaturas e Sincronização de Estado           |
+-----------------------------------+-----------------------------------+
                                    |
                             (Android Intent)
                                    |
+-----------------------------------v-----------------------------------+
|                        PlaybackService (Foreground)                   |
|  - MediaSessionCompat & MediaMetadataCompat                           |
|  - Gerenciamento de Notificação de Mídia em Primeiro Plano            |
|  - Cache de Bitmap em Memória (LruCache)                              |
+-----------------------------------+-----------------------------------+
                                    |
                    +---------------+---------------+
                    |                               |
+-------------------v---------------+ +-------------v-------------------+
|    Central de Notificações /      | |   Ilha Dinâmica do HyperOS      |
|    Tela de Bloqueio do Android    | |   (Xiaomi / POCO / Redmi)       |
+-----------------------------------+ +---------------------------------+
```

---

## Especificações Técnicas

| Componente | Especificação |
| :--- | :--- |
| **Versão Mínima do Android** | Android 8.0 (Oreo / API 26) |
| **Versão Alvo do Android** | Android 14 / 15 / 16 (API 34+) |
| **Arquitetura Suportada** | `arm64-v8a` (Processadores 64-bit) |
| **Motor de Renderização** | Mozilla GeckoView v128.0 |
| **Linguagem Principal** | Kotlin 1.9 / Java 17 |
| **Protocolo de Áudio** | Android MediaSessionCompat & AudioFocus V2 |

---

## Instalação

### Opção 1: Download Direto do Release
1. Acesse a aba de [Releases](https://github.com/DiogoCrespi/youtube_kiosk_browser/releases).
2. Baixe o arquivo `app-release.apk` da versão mais recente.
3. Instale no seu dispositivo Android habilitando a instalação de fontes desconhecidas se solicitado.

### Opção 2: Instalação via ADB
Com o dispositivo conectado via USB ou Wi-Fi com a Depuração USB ativada:

```bash
adb install -r -d app-release.apk
```

---

## Compilação a Partir do Código Fonte

### Pré-requisitos
- **JDK 17** (OpenJDK ou Eclipse Adoptium)
- **Android SDK** com Build-Tools 34.0.0 e NDK instalados
- **Git**

### Passo a Passo

1. Clone o repositório:
```bash
git clone https://github.com/DiogoCrespi/youtube_kiosk_browser.git
cd youtube_kiosk_browser
```

2. Configure a variável `JAVA_HOME` para o JDK 17:
```bash
# Windows PowerShell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot"

# Linux / macOS
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
```

3. Compile o APK de Release assinado:
```bash
# Windows
.\gradlew.bat assembleRelease

# Linux / macOS
./gradlew assembleRelease
```

4. O arquivo gerado estará localizado em:
```
app/build/outputs/apk/release/app-release.apk
```

---

## Permissões Utilizadas

- `android.permission.INTERNET`: Acesso à rede para streaming de vídeo, metadados e API do SponsorBlock.
- `android.permission.ACCESS_NETWORK_STATE`: Monitoramento de conectividade para recuperação de falhas de rede.
- `android.permission.FOREGROUND_SERVICE`: Execução do serviço de reprodução de mídia em primeiro plano.
- `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK`: Conformidade com as políticas de segundo plano do Android 14+.
- `android.permission.WAKE_LOCK`: Prevenção de suspensão do processador durante reprodução com tela desligada.
- `android.permission.POST_NOTIFICATIONS`: Exibição da notificação de controle de mídia e capa do vídeo.

---

## Licença

Este projeto é distribuído sob a licença **MIT**. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.

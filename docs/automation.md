# Automatización (sin intervención manual)

El copiloto corre en segundo plano: busca ofertas, las puntúa, las guarda en Notion, genera CV + cover para las mejores, y revisa Gmail.

## Arranque rápido

1. Completa `.env.local` (Notion, LLM, perfil en `resume/master-profile.md` con `## Preferences`).
2. Fuentes mínimas sin configurar boards ATS:

```bash
REMOTEOK_ENABLED=1
HIMALAYAS_ENABLED=1
HIMALAYAS_SEARCH_QUERY=software engineer remote
```

3. Deja el daemon corriendo:

```bash
npm run copilot
```

O un ciclo único (ideal para cron):

```bash
npm run copilot:once
```

## Qué hace cada ciclo

1. **Ingesta** — Greenhouse, Lever, Ashby, Himalayas, RemoteOK, RSS, URLs de career pages.
2. **Scoring LLM** — solo entra en Notion si pasa `INGEST_MIN_SCORE`.
3. **Auto-packet** — si `Match=Apply` y `Score >= AUTO_PACKET_MIN_SCORE`, genera resume + cover en `output/` y pone status `Packet ready`.
4. **Auto-apply** (opcional) — si `AUTO_APPLY=1`, cola **Packet ready** + gate de confianza → envío Greenhouse estándar o dry-run en log. Ver **[auto-apply.md](auto-apply.md)**.
5. **Inbox** — correos relevantes → brief en log + notificación macOS + nota en Notion.

## Tu intervención (casos raros)

| Situación | Qué haces tú |
|-----------|----------------|
| Oferta con packet listo | Con `AUTO_APPLY=1` + dry-run revisas `logs/copilot.log`; sin auto-apply, abres link y envías formulario |
| Score dudoso | Cambias status en Notion |
| Email de entrevista | Lees brief / notificación, respondes |
| Perfil desactualizado | Editas `master-profile.md` (el copiloto lo usa en el próximo ciclo) |

## macOS: dejarlo siempre encendido

```bash
# Instalar plist (ajusta rutas si tu repo no está en ~/Workspaces/job-tracker)
cp docs/com.jobtracker.copilot.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.jobtracker.copilot.plist
```

Edita `docs/com.jobtracker.copilot.plist` con tu ruta absoluta a `node` y al repo.

## Variables clave

| Variable | Default | Efecto |
|----------|---------|--------|
| `INGEST_INTERVAL_MINUTES` | 360 | Cada cuánto busca ofertas |
| `INBOX_INTERVAL_MINUTES` | 15 | Cada cuánto revisa Gmail |
| `AUTO_PACKET` | 1 | Genera CV/cover automático |
| `AUTO_PACKET_MIN_SCORE` | 75 | Umbral para auto-packet |
| `INGEST_MIN_SCORE` | 0 | No guarda en Notion por debajo |
| `COPILOT_NOTIFY` | 0 | `1` = notificaciones macOS |
| `COPILOT_INBOX` | 1 | Revisar Gmail en cada ciclo |
| `AUTO_APPLY` | 0 | `1` = cola de apply tras auto-packet |
| `AUTO_APPLY_DRY_RUN` | 1 | `0` + `AUTO_APPLY_LIVE=1` para enviar de verdad |

## Notion

Añade status **`Packet ready`** en Application Status.

Vista recomendada: **Match = Apply**, **Status = Packet ready** → cola de postulaciones listas.

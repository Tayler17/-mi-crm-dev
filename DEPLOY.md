# Despliegue en el VPS

> Importante: el servicio **web** (Next.js) corre desde una **imagen pre-construida**
> (`crm-dev-web`); el `npm run build` ocurre al construir la imagen. **No tiene el
> código montado como volumen.** Por eso `--force-recreate` NO basta para el frontend:
> solo recrea el contenedor reutilizando la imagen vieja. Para que un cambio de
> frontend se vea, **hay que reconstruir la imagen con `--build`**.
>
> El servicio **api** sí monta el código (`./api:/app`) y corre `npm run start:dev`
> (nest watch), así que un `git pull` + reinicio recompila solo — no necesita `--build`.

## Según lo que cambió

### Solo backend (carpeta `api/`)
```bash
cd /opt/crm && git pull && docker compose up -d --force-recreate api
```

### Solo frontend (carpeta `web/`)
```bash
cd /opt/crm && git pull && docker compose up -d --build web
```

### Ambos (api + web)
```bash
cd /opt/crm && git pull \
  && docker compose up -d --build web \
  && docker compose up -d --force-recreate api
```

## Notas

- `--force-recreate` recrea el contenedor pero **NO reconstruye la imagen**. Solo
  `--build` reconstruye (necesario para que Next.js tome el código nuevo).
- Tras desplegar frontend, en el navegador hacer **Ctrl+Shift+R** (hard refresh) para
  saltar la caché del navegador.
- El archivo `/opt/crm/docker-compose.override.yml` (solo en el VPS, no en git) tiene
  las variables de producción (`DATABASE_URL` → `crm_prod`, URLs públicas). No se borra
  con `git pull`. No lo toques al desplegar.
- Para ver logs del backend: `docker logs crm_api --tail 50 -f`

# ============================================================
# El Container del video animado: Node + @napi-rs/canvas (Skia) y el MISMO motor que la vista previa.
# Se construye desde la RAÍZ del repositorio (image_build_context "." en wrangler.jsonc): copia src/lib tal cual,
# así el motor del Container no puede quedarse atrás del de la pantalla.
# ============================================================
# La imagen oficial de Node desde su espejo en ECR: Docker Hub limita las descargas anónimas y un despliegue no puede
# depender de eso. Sin apt: la letra de respaldo (Roboto) llega por npm y la registra el propio servidor.
FROM public.ecr.aws/docker/library/node:22-bookworm-slim

WORKDIR /app
# Los .js de src/lib son módulos ES (en el repositorio lo dice el package.json de la raíz).
RUN echo '{"type":"module","private":true}' > /app/package.json

COPY container/package.json container/package-lock.json ./container/
RUN cd container && npm ci --omit=dev --no-audit --no-fund

COPY src/lib ./src/lib
COPY container/*.mjs ./container/

ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "container/servidor.mjs"]

#!/bin/sh
# =============================================================================
# Backup diário do banco, com retenção
# =============================================================================
# Duas camadas, de propósito:
#
#   1. Este dump, dentro da gaveta, para restauração rápida de um engano
#      recente ("apagaram a ordem errada às 14h").
#   2. O Auto Backup da VPS, fora da gaveta, para o caso de o servidor
#      inteiro se perder. Ele é ligado À MÃO no painel da Hostinger (passo 14
#      do DEPLOY.md) — quer dizer, pode estar desligado sem ninguém perceber.
#      Confira uma vez por trimestre; sem ele, a camada 1 mora no mesmo disco
#      que o banco, e um disco perdido leva os dois.
#
# Uma sozinha não resolve: o snapshot da VPS restaura tudo (inclusive as outras
# gavetas), o dump não sobrevive à perda do servidor.
#
# ATENÇÃO: backup que nunca foi restaurado não é backup, é esperança. O guia
# de deploy traz o ensaio de restauração — faça-o uma vez antes de confiar.
# =============================================================================
set -e

DESTINO=/backups
RETENCAO_DIAS=${BACKUP_RETENCAO_DIAS:-14}
INTERVALO=${BACKUP_INTERVALO_SEGUNDOS:-86400}

mkdir -p "$DESTINO"

# A senha vem do ambiente, nunca da linha de comando: argumento de processo é
# legível por qualquer um que rode `ps` no host.
export PGPASSWORD="$POSTGRES_PASSWORD"

while true; do
  CARIMBO=$(date +%Y-%m-%d_%H%M)
  ARQUIVO="$DESTINO/dtechmed_${CARIMBO}.sql.gz"

  echo "[backup] iniciando $CARIMBO"
  if pg_dump \
        --host=db \
        --username="${POSTGRES_USER:-dtechmed_owner}" \
        --dbname="${POSTGRES_DB:-dtechmed}" \
        --format=plain --no-owner --no-privileges \
      | gzip -9 > "$ARQUIVO.parcial"
  then
    # =========================================================================
    # O DUMP É CONFERIDO ANTES DE GANHAR O NOME DEFINITIVO
    # =========================================================================
    # O `pg_dump | gzip` pode terminar com código zero e ainda assim deixar um
    # arquivo imprestável: disco que encheu no meio da escrita, contêiner
    # morto entre um bloco e outro. O `gzip -t` descompacta tudo e confere a
    # soma de verificação do próprio formato — se o arquivo estiver truncado,
    # ele acusa aqui.
    #
    # Sem esta conferência, o defeito só aparece no pior momento possível: às
    # duas da manhã, com o sistema fora do ar, na hora de restaurar.
    if ! gzip -t "$ARQUIVO.parcial" 2>/dev/null; then
      rm -f "$ARQUIVO.parcial"
      echo "[backup] CORROMPIDO em $CARIMBO — o arquivo não passou na conferência e foi descartado" >&2
      sleep "$INTERVALO"
      continue
    fi

    mv "$ARQUIVO.parcial" "$ARQUIVO"

    # A impressão digital ao lado do arquivo. Serve para duas coisas: provar
    # que o que foi restaurado é o mesmo que foi gravado, e detectar alteração
    # silenciosa — inclusive a de quem mexeu no que não devia.
    if command -v sha256sum >/dev/null 2>&1; then
      (cd "$DESTINO" && sha256sum "$(basename "$ARQUIVO")" > "$(basename "$ARQUIVO").sha256")
    fi

    echo "[backup] concluído e conferido: $(du -h "$ARQUIVO" | cut -f1)"
  else
    rm -f "$ARQUIVO.parcial"
    echo "[backup] FALHOU em $CARIMBO — NENHUM dump novo foi gravado" >&2
  fi

  # Retenção. `-mtime +N` conta dias inteiros.
  APAGADOS=$(find "$DESTINO" -name 'dtechmed_*.sql.gz' -mtime "+$RETENCAO_DIAS" -print -delete | wc -l)
  # A impressão digital acompanha o dump que ela descreve: deixá-la para trás
  # encheria a pasta de arquivos apontando para nada.
  find "$DESTINO" -name 'dtechmed_*.sql.gz.sha256' -mtime "+$RETENCAO_DIAS" -delete 2>/dev/null || true
  [ "$APAGADOS" -gt 0 ] && echo "[backup] $APAGADOS dump(s) antigo(s) removido(s)"

  sleep "$INTERVALO"
done

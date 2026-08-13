#!/bin/sh
# =============================================================================
# Backup diário do banco, com retenção
# =============================================================================
# Duas camadas, de propósito:
#
#   1. Este dump, dentro da gaveta, para restauração rápida de um engano
#      recente ("apagaram a ordem errada às 14h").
#   2. O Auto Backup da VPS, fora da gaveta, para o caso de o servidor
#      inteiro se perder.
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
    # Só renomeia depois de terminar. Assim nunca existe um arquivo com nome
    # definitivo e conteúdo truncado, que numa emergência seria restaurado
    # com confiança e falharia no meio.
    mv "$ARQUIVO.parcial" "$ARQUIVO"
    echo "[backup] concluído: $(du -h "$ARQUIVO" | cut -f1)"
  else
    rm -f "$ARQUIVO.parcial"
    echo "[backup] FALHOU em $CARIMBO" >&2
  fi

  # Retenção. `-mtime +N` conta dias inteiros.
  APAGADOS=$(find "$DESTINO" -name 'dtechmed_*.sql.gz' -mtime "+$RETENCAO_DIAS" -print -delete | wc -l)
  [ "$APAGADOS" -gt 0 ] && echo "[backup] $APAGADOS dump(s) antigo(s) removido(s)"

  sleep "$INTERVALO"
done

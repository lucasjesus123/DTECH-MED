import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * Verificação de saúde para o Docker e o proxy reverso.
 *
 * Consulta o banco de propósito: um processo que responde mas perdeu a conexão
 * está inútil, e um healthcheck que só confirma "o Node está vivo" mantém no
 * ar um contêiner que não serve para nada.
 *
 * Não expõe versão, host nem nome de banco: página de saúde é ponto de
 * reconhecimento para quem está sondando.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

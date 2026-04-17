import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'node:child_process'
import path from 'node:path'

export const runtime = 'nodejs'

function extractLastJsonBlock(text: string): any | null {
  const trimmed = String(text || '').trim()
  const i = trimmed.lastIndexOf('{')
  if (i < 0) return null
  try {
    return JSON.parse(trimmed.slice(i))
  } catch {
    return null
  }
}

async function runProcessScript(timeoutMs = 120000): Promise<{ ok: boolean; code: number; stdout: string; stderr: string; parsed?: any }> {
  const cwd = process.cwd()
  const scriptPath = path.join(cwd, 'scripts', 'process_bpp_uploads.mjs')

  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      resolve({ ok: false, code: -1, stdout, stderr: `${stderr}\n[timeout] process exceeded ${timeoutMs}ms` })
    }, timeoutMs)

    child.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })

    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const parsed = extractLastJsonBlock(stdout)
      resolve({
        ok: code === 0,
        code: Number(code || 0),
        stdout,
        stderr,
        parsed: parsed || undefined,
      })
    })
  })
}

export async function POST(_request: NextRequest) {
  try {
    const result = await runProcessScript()
    if (!result.ok) {
      return NextResponse.json(
        {
          error: '自动解析失败',
          code: result.code,
          stderr: result.stderr,
          stdout: result.stdout,
        },
        { status: 500 },
      )
    }
    return NextResponse.json({
      ok: true,
      code: result.code,
      parsed: result.parsed || null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '自动解析失败' }, { status: 500 })
  }
}


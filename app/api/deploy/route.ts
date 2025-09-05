import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'

export async function POST(req: NextRequest) {
  try {
    const { fragment, sbxId } = await req.json()

    if (!fragment || !sbxId) {
      return NextResponse.json(
        { error: 'Missing fragment or sbxId' },
        { status: 400 }
      )
    }

    const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL
    const deployToken = process.env.VERCEL_DEPLOY_TOKEN

    if (!deployHookUrl) {
      return NextResponse.json(
        { error: 'Vercel Deploy Hook not configured' },
        { status: 500 }
      )
    }

    // Create a zip file with the fragment code
    const zip = new JSZip()
    const code = fragment.code

    if (Array.isArray(code)) {
      for (const file of code) {
        const filePath = file?.file_path || 'file.txt'
        const content = file?.file_content || ''
        zip.file(filePath, content)
      }
    } else {
      const filePath = fragment.file_path || 'index.js'
      const content = code || ''
      zip.file(filePath, content)
    }

    // Add package.json for Next.js projects
    if (fragment.template === 'nextjs-developer') {
      const packageJson = {
        name: fragment.title || 'fragment-app',
        version: '1.0.0',
        private: true,
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
          lint: 'next lint'
        },
        dependencies: {
          next: '^14.2.30',
          react: '^18',
          'react-dom': '^18',
          typescript: '^5.5.4',
          '@types/node': '^22.2.0',
          '@types/react': '^18',
          '@types/react-dom': '^18',
          tailwindcss: '^3.4.1',
          postcss: '^8'
        }
      }
      zip.file('package.json', JSON.stringify(packageJson, null, 2))
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    // Trigger Vercel Deploy Hook
    const deployResponse = await fetch(deployHookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(deployToken && { Authorization: `Bearer ${deployToken}` })
      },
      body: JSON.stringify({
        name: fragment.title || 'fragment-deployment',
        files: {
          [`${fragment.title || 'fragment'}.zip`]: zipBuffer.toString('base64')
        }
      })
    })

    if (!deployResponse.ok) {
      throw new Error(`Deploy hook failed: ${deployResponse.statusText}`)
    }

    const deployResult = await deployResponse.json()

    return NextResponse.json({
      success: true,
      deployUrl: deployResult.url || 'Deployment initiated',
      message: 'Successfully triggered Vercel deployment'
    })

  } catch (error: any) {
    console.error('Deploy error:', error)
    return NextResponse.json(
      { error: 'Deployment failed', message: error.message },
      { status: 500 }
    )
  }
}
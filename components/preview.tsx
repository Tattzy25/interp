import { DeployDialog } from './deploy-dialog'
import { FragmentCode } from './fragment-code'
import { FragmentPreview } from './fragment-preview'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { FragmentSchema } from '@/lib/schema'
import { ExecutionResult } from '@/lib/types'
import { DeepPartial } from 'ai'
import { ChevronsRight, LoaderCircle, Download } from 'lucide-react'
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'

export function Preview({
  teamID,
  accessToken,
  selectedTab,
  onSelectedTabChange,
  isChatLoading,
  isPreviewLoading,
  fragment,
  result,
  onClose,
}: {
  teamID: string | undefined
  accessToken: string | undefined
  selectedTab: 'code' | 'fragment'
  onSelectedTabChange: Dispatch<SetStateAction<'code' | 'fragment'>>
  isChatLoading: boolean
  isPreviewLoading: boolean
  fragment?: DeepPartial<FragmentSchema>
  result?: ExecutionResult
  onClose: () => void
}) {
  // Streaming-like staged messages for preview loading UX
  const stages = useMemo(
    () => [
      'Queuing build…',
      'Allocating sandbox…',
      'Copying files…',
      'Installing dependencies…',
      'Starting server…',
      'Connecting to preview…',
    ],
    [],
  )
  const [stageIndex, setStageIndex] = useState(0)
  useEffect(() => {
    if (!isPreviewLoading) {
      setStageIndex(0)
      return
    }
    let i = 0
    setStageIndex(0)
    const id = setInterval(() => {
      i = (i + 1) % stages.length
      setStageIndex(i)
    }, 600)
    return () => clearInterval(id)
  }, [isPreviewLoading, stages])

  if (!fragment) {
    return null
  }

  const isLinkAvailable = result?.template !== 'code-interpreter-v1'

  function exportZip() {
    if (!fragment) return
    const zip = new JSZip()

    const code: any = (fragment as any).code
    if (Array.isArray(code)) {
      for (const file of code) {
        const filePath = file?.file_path || 'file.txt'
        const content = file?.file_content || ''
        zip.file(filePath, content)
      }
    } else {
      const filePath = fragment.file_path || 'fragment.txt'
      const content = (fragment.code as string) || ''
      zip.file(filePath, content)
    }

    const filename = `${fragment.title || 'fragment'}.zip`
    zip.generateAsync({ type: 'blob' }).then((blob) => {
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    })
  }

  return (
    <div className="absolute md:relative z-10 top-0 left-0 shadow-2xl md:rounded-tl-3xl md:rounded-bl-3xl md:border-l md:border-y bg-popover h-full w-full overflow-auto">
      <Tabs
        value={selectedTab}
        onValueChange={(value) =>
          onSelectedTabChange(value as 'code' | 'fragment')
        }
        className="h-full flex flex-col items-start justify-start relative"
      >
        <div className="w-full p-2 grid grid-cols-3 items-center border-b">
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground"
                  onClick={onClose}
                >
                  <ChevronsRight className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close sidebar</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex justify-center">
            <TabsList className="px-1 py-0 border h-8">
              <TabsTrigger
                className="font-normal text-xs py-1 px-2 gap-1 flex items-center"
                value="code"
              >
                {isChatLoading && (
                  <LoaderCircle
                    strokeWidth={3}
                    className="h-3 w-3 animate-spin"
                  />
                )}
                Code
              </TabsTrigger>
              <TabsTrigger
                disabled={!result}
                className="font-normal text-xs py-1 px-2 gap-1 flex items-center"
                value="fragment"
              >
                Preview
                {isPreviewLoading && (
                  <LoaderCircle
                    strokeWidth={3}
                    className="h-3 w-3 animate-spin"
                  />
                )}
              </TabsTrigger>
            </TabsList>
          </div>
          {result && (
            <div className="flex items-center justify-end gap-2">
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={exportZip}
                    >
                      <Download className="h-4 w-4" />
                      <span className="hidden sm:inline">Export ZIP</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Export generated files as a ZIP</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {isLinkAvailable && (
                <DeployDialog
                  url={result.url!}
                  sbxId={result.sbxId!}
                  teamID={teamID}
                  accessToken={accessToken}
                />
              )}
            </div>
          )}
        </div>
        {fragment && (
          <div className="relative overflow-y-auto w-full h-full">
            {/* Loading overlay during preview generation */}
            {selectedTab === 'fragment' && isPreviewLoading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-xl border bg-card shadow-sm">
                  <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
                  <div className="text-sm text-muted-foreground">
                    {stages[stageIndex]}
                  </div>
                  <div className="w-56 h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary/70 animate-[shimmer_1.2s_linear_infinite]" style={{ width: '40%' }} />
                  </div>
                </div>
              </div>
            )}

            <TabsContent value="code" className="h-full">
              {(() => {
                const anyFragment: any = fragment
                const filesArr = Array.isArray(anyFragment?.code)
                  ? (anyFragment.code as Array<{ file_path: string; file_content: string }>).
                      filter((f) => !!f?.file_path)
                      .map((f) => ({ name: f.file_path, content: f.file_content || '' }))
                  : fragment.file_path && fragment.code
                  ? [{ name: fragment.file_path, content: (fragment.code as string) }]
                  : []

                return filesArr.length > 0 ? (
                  <FragmentCode files={filesArr} />
                ) : null
              })()}
            </TabsContent>
            <TabsContent value="fragment" className="h-full">
              {result && <FragmentPreview result={result as ExecutionResult} />}
            </TabsContent>
          </div>
        )}
      </Tabs>
    </div>
  )
}

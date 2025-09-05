import { CodeView } from './code-view'
import { Button } from './ui/button'
import { CopyButton } from './ui/copy-button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ChevronDown, ChevronRight, Download, FileText, Folder, FolderOpen } from 'lucide-react'
import { useMemo, useState } from 'react'

export function FragmentCode({
  files,
}: {
  files: { name: string; content: string }[]
}) {
  const [currentFile, setCurrentFile] = useState(files[0].name)
  const currentFileContent = files.find(
    (file) => file.name === currentFile,
  )?.content

  function download(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.style.display = 'none'
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  type TreeNode = { key: string; name: string; type: 'folder' | 'file'; children?: TreeNode[] }

  const tree = useMemo(() => {
    const root: TreeNode = { key: '/', name: '/', type: 'folder', children: [] }
    for (const f of files) {
      const parts = f.name.split('/').filter(Boolean)
      let cursor = root
      parts.forEach((part, idx) => {
        const isFile = idx === parts.length - 1
        if (isFile) {
          cursor.children = cursor.children || []
          cursor.children.push({ key: f.name, name: part, type: 'file' })
        } else {
          const nextKey = parts.slice(0, idx + 1).join('/') + '/'
          let child = cursor.children?.find((c) => c.key === nextKey)
          if (!child) {
            child = { key: nextKey, name: part, type: 'folder', children: [] }
            cursor.children = cursor.children || []
            cursor.children.push(child)
          }
          cursor = child
        }
      })
    }
    function sort(node: TreeNode) {
      if (!node.children) return
      node.children.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name)
        return a.type === 'folder' ? -1 : 1
      })
      node.children.forEach(sort)
    }
    sort(root)
    return root
  }, [files])

  const [expanded, setExpanded] = useState<Record<string, boolean>>({ '/': true })
  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function Tree({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
    if (node.type === 'file') {
      return (
        <div
          className={`pl-${Math.min(depth, 6) * 2} py-1 pr-2 text-sm cursor-pointer rounded hover:bg-muted ${currentFile === node.key ? 'bg-muted font-medium' : ''}`}
          onClick={() => setCurrentFile(node.key)}
          title={node.key}
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="truncate">{node.name}</span>
          </div>
        </div>
      )
    }
    const isOpen = expanded[node.key] ?? true
    return (
      <div>
        <div
          className={`pl-${Math.min(depth, 6) * 2} py-1 pr-2 text-sm select-none cursor-pointer rounded hover:bg-muted`}
          onClick={() => toggle(node.key)}
        >
          <div className="flex items-center gap-2">
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {isOpen ? (
              <FolderOpen className="h-4 w-4" />
            ) : (
              <Folder className="h-4 w-4" />
            )}
            <span className="truncate font-medium">{node.name}</span>
          </div>
        </div>
        {isOpen && node.children && (
          <div>
            {node.children.map((c) => (
              <Tree key={c.key} node={c} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Left: folder/file tree */}
      <div className="hidden md:block w-60 border-r overflow-y-auto p-2">
        {tree.children && tree.children.map((n) => <Tree key={n.key} node={n} depth={0} />)}
      </div>

      {/* Right: code viewer */}
      <div className="flex-1 flex flex-col h-full">
        <div className="flex items-center px-2 pt-1 gap-2">
          <div className="flex flex-1 gap-2 overflow-x-auto">
            {files.map((file) => (
              <div
                key={file.name}
                className={`flex gap-2 select-none cursor-pointer items-center text-sm text-muted-foreground px-2 py-1 rounded-md hover:bg-muted border ${
                  file.name === currentFile ? 'bg-muted border-muted' : ''
                }`}
                onClick={() => setCurrentFile(file.name)}
              >
                <FileText className="h-4 w-4" />
                {file.name}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <CopyButton
                    content={currentFileContent || ''}
                    className="text-muted-foreground"
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom">Copy</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground"
                    onClick={() =>
                      download(currentFile, currentFileContent || '')
                    }
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Download</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="flex flex-col flex-1 overflow-x-auto">
          <CodeView
            code={currentFileContent || ''}
            lang={currentFile.split('.').pop() || ''}
          />
        </div>
      </div>
    </div>
  )
}

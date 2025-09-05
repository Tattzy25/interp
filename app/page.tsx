'use client'

import { ViewType } from '@/components/auth'
import { AuthDialog } from '@/components/auth-dialog'
import { Chat } from '@/components/chat'
import { ChatInput } from '@/components/chat-input'
import { ChatPicker } from '@/components/chat-picker'
import { ChatSettings } from '@/components/chat-settings'
import { NavBar } from '@/components/navbar'
import { Preview } from '@/components/preview'
import { useAuth } from '@/lib/auth'
import { Message, toAISDKMessages, toMessageImage } from '@/lib/messages'
import { LLMModelConfig } from '@/lib/models'
import modelsList from '@/lib/models.json'
import { FragmentSchema, fragmentSchema as schema } from '@/lib/schema'
import { supabase } from '@/lib/supabase'
import templates, { TemplateId } from '@/lib/templates'
import { ExecutionResult } from '@/lib/types'
import { DeepPartial } from 'ai'
import { experimental_useObject as useObject } from 'ai/react'
import { usePostHog } from 'posthog-js/react'
import { SetStateAction, useEffect, useRef, useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { toast } from '@/components/ui/use-toast'

export default function Home() {
  const [chatInput, setChatInput] = useLocalStorage('chat', '')
  const [files, setFiles] = useState<File[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<'auto' | TemplateId>(
    'auto',
  )
  const [languageModel, setLanguageModel] = useLocalStorage<LLMModelConfig>(
    'languageModel',
    {
      model: 'claude-3-5-sonnet-latest',
    },
  )

  const posthog = usePostHog()

  const [result, setResult] = useState<ExecutionResult>()
  const [messages, setMessages] = useState<Message[]>([])
  const [fragment, setFragment] = useState<DeepPartial<FragmentSchema>>()
  const [currentTab, setCurrentTab] = useState<'code' | 'fragment'>('code')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isAuthDialogOpen, setAuthDialog] = useState(false)
  const [authView, setAuthView] = useState<ViewType>('sign_in')
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const { session, userTeam } = useAuth(setAuthDialog, setAuthView)

  const filteredModels = modelsList.models.filter((model) => {
    if (process.env.NEXT_PUBLIC_HIDE_LOCAL_MODELS) {
      return model.providerId !== 'ollama'
    }
    return true
  })

  const currentModel = filteredModels.find(
    (model) => model.id === languageModel.model,
  )
  const currentTemplate =
    selectedTemplate === 'auto'
      ? templates
      : { [selectedTemplate]: templates[selectedTemplate] }
  const lastMessage = messages[messages.length - 1]

  // Resizable panes + preview loading timing
  const [chatPaneWidth, setChatPaneWidth] = useLocalStorage<number>('chatPaneWidth', 48)
  const isDraggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const previewStartRef = useRef<number | null>(null)
  const MIN_PREVIEW_MS = 3000

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDraggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percent = Math.max(20, Math.min(80, (x / rect.width) * 100))
      setChatPaneWidth(parseFloat(percent.toFixed(2)))
    }
    function onMouseUp() {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [setChatPaneWidth])

  function startDrag() {
    isDraggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  const { object, submit, isLoading, stop, error } = useObject({
    api: '/api/chat',
    schema,
    onError: (error) => {
      console.error('Error submitting request:', error)
      const raw = error?.message || 'Something went wrong. Please try again.'
      let message = raw
      let code: string | undefined
      if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(raw)
          if (parsed?.message && typeof parsed.message === 'string') {
            message = parsed.message
          }
          if (parsed?.error && typeof parsed.error === 'string') {
            code = parsed.error
          }
        } catch (_) {
          // ignore JSON parse failure and fallback to raw
        }
      }

      if (!code && /429|rate.?limit|too many/i.test(raw)) {
        code = 'rate_limited'
      }

      if (code === 'rate_limited' || /limit/i.test(message)) {
        setIsRateLimited(true)
      }

      setErrorMessage(message)
      toast({ title: 'Request failed', description: message })
    },
    onFinish: async ({ object: fragment, error }) => {
      if (!error) {
        // send it to /api/sandbox
        console.log('fragment', fragment)
        setIsPreviewLoading(true)
        previewStartRef.current = Date.now()
        posthog.capture('fragment_generated', {
          template: fragment?.template,
        })

        const response = await fetch('/api/sandbox', {
          method: 'POST',
          body: JSON.stringify({
            fragment,
            userID: session?.user?.id,
            teamID: userTeam?.id,
            accessToken: session?.access_token,
          }),
        })

        const result = await response.json()
        console.log('result', result)
        posthog.capture('sandbox_created', { url: result.url })

        setResult(result)
        setCurrentPreview({ fragment, result })
        setMessage({ result })
        setCurrentTab('fragment')
        const elapsed = previewStartRef.current ? Date.now() - previewStartRef.current : 0
        const remain = Math.max(0, MIN_PREVIEW_MS - elapsed)
        setTimeout(() => setIsPreviewLoading(false), remain)

        // Persist build (best-effort)
        try {
          await persistBuild({
            fragment: fragment as DeepPartial<FragmentSchema>,
            result: result as ExecutionResult,
            userId: session?.user?.id ?? null,
            teamId: userTeam?.id ?? null,
            posthog,
          })
        } catch (e) {
          console.warn('Persist build failed silently:', e)
        }
      }
    },
  })

  useEffect(() => {
    if (object) {
      setFragment(object)
      const content: Message['content'] = [
        { type: 'text', text: object.commentary || '' },
        { type: 'code', text: object.code || '' },
      ]

      if (!lastMessage || lastMessage.role !== 'assistant') {
        addMessage({
          role: 'assistant',
          content,
          object,
        })
      }

      if (lastMessage && lastMessage.role === 'assistant') {
        setMessage({
          content,
          object,
        })
      }
    }
  }, [object])

  useEffect(() => {
    if (error) stop()
  }, [error])

  function setMessage(message: Partial<Message>, index?: number) {
    setMessages((previousMessages) => {
      const updatedMessages = [...previousMessages]
      updatedMessages[index ?? previousMessages.length - 1] = {
        ...previousMessages[index ?? previousMessages.length - 1],
        ...message,
      }

      return updatedMessages
    })
  }

  async function handleSubmitAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!session) {
      return setAuthDialog(true)
    }

    if (isLoading) {
      stop()
    }

    setIsRateLimited(false)
    setErrorMessage('')
    const content: Message['content'] = [{ type: 'text', text: chatInput }]
    const images = await toMessageImage(files)

    if (images.length > 0) {
      images.forEach((image) => {
        content.push({ type: 'image', image })
      })
    }

    const updatedMessages = addMessage({
      role: 'user',
      content,
    })

    submit({
      userID: session?.user?.id,
      teamID: userTeam?.id,
      messages: toAISDKMessages(updatedMessages),
      template: currentTemplate,
      model: currentModel,
      config: languageModel,
    })

    setChatInput('')
    setFiles([])
    setCurrentTab('code')

    posthog.capture('chat_submit', {
      template: selectedTemplate,
      model: languageModel.model,
    })
  }

  function retry() {
    setIsRateLimited(false)
    setErrorMessage('')
    submit({
      userID: session?.user?.id,
      teamID: userTeam?.id,
      messages: toAISDKMessages(messages),
      template: currentTemplate,
      model: currentModel,
      config: languageModel,
    })
  }

  function addMessage(message: Message) {
    setMessages((previousMessages) => [...previousMessages, message])
    return [...messages, message]
  }

  function handleSaveInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setChatInput(e.target.value)
  }

  function handleFileChange(change: SetStateAction<File[]>) {
    setFiles(change)
  }

  function logout() {
    supabase
      ? supabase.auth.signOut()
      : console.warn('Supabase is not initialized')
  }

  function handleLanguageModelChange(e: LLMModelConfig) {
    setLanguageModel({ ...languageModel, ...e })
  }

  function handleSocialClick(target: 'github' | 'x' | 'discord') {
    if (target === 'github') {
      window.open('https://github.com/codehomie', '_blank')
    } else if (target === 'x') {
      window.open('https://x.com/codehomie', '_blank')
    } else if (target === 'discord') {
      window.open('https://discord.gg/codehomie', '_blank')
    }

    posthog.capture(`${target}_click`)
  }

  function handleClearChat() {
    stop()
    setChatInput('')
    setFiles([])
    setMessages([])
    setFragment(undefined)
    setResult(undefined)
    setCurrentTab('code')
    setIsPreviewLoading(false)
  }

  function setCurrentPreview(preview: {
    fragment: DeepPartial<FragmentSchema> | undefined
    result: ExecutionResult | undefined
  }) {
    setFragment(preview.fragment)
    setResult(preview.result)
  }

  function handleUndo() {
    setMessages((previousMessages) => [...previousMessages.slice(0, -2)])
    setCurrentPreview({ fragment: undefined, result: undefined })
  }

  const showPreview = Boolean(fragment)

  return (
    <main className="flex min-h-screen max-h-screen">
      {supabase && (
        <AuthDialog
          open={isAuthDialogOpen}
          setOpen={setAuthDialog}
          view={authView}
          supabase={supabase}
        />
      )}
      <div
        ref={containerRef}
        className="flex w-full h-screen overflow-hidden md:flex-row flex-col"
      >
        <div
          className={`flex flex-col max-h-full px-4 overflow-auto ${showPreview ? '' : 'w-full'}`}
          style={showPreview ? { width: `${chatPaneWidth}%` } : undefined}
        >
          <NavBar
            session={session}
            showLogin={() => setAuthDialog(true)}
            signOut={logout}
            onSocialClick={handleSocialClick}
            onClear={handleClearChat}
            canClear={messages.length > 0}
            canUndo={messages.length > 1 && !isLoading}
            onUndo={handleUndo}
          />
          <Chat
            messages={messages}
            isLoading={isLoading}
            setCurrentPreview={setCurrentPreview}
          />
          <ChatInput
            retry={retry}
            isErrored={error !== undefined}
            errorMessage={errorMessage}
            isLoading={isLoading}
            isRateLimited={isRateLimited}
            stop={stop}
            input={chatInput}
            handleInputChange={handleSaveInputChange}
            handleSubmit={handleSubmitAuth}
            isMultiModal={currentModel?.multiModal || false}
            files={files}
            handleFileChange={handleFileChange}
          >
            <ChatPicker
              templates={templates}
              selectedTemplate={selectedTemplate}
              onSelectedTemplateChange={setSelectedTemplate}
              models={filteredModels}
              languageModel={languageModel}
              onLanguageModelChange={handleLanguageModelChange}
            />
            <ChatSettings
              languageModel={languageModel}
              onLanguageModelChange={handleLanguageModelChange}
              apiKeyConfigurable={!process.env.NEXT_PUBLIC_NO_API_KEY_INPUT}
              baseURLConfigurable={!process.env.NEXT_PUBLIC_NO_BASE_URL_INPUT}
            />
          </ChatInput>
        </div>

        {showPreview && (
          <>
            <div
              onMouseDown={startDrag}
              className="hidden md:block w-[6px] cursor-col-resize bg-border hover:bg-primary/40 transition-colors"
              style={{ height: '100%' }}
              aria-label="Resize preview pane"
              role="separator"
            />
            <div className="flex-1 min-w-0" style={{ width: `${100 - chatPaneWidth}%` }}>
              <Preview
                teamID={userTeam?.id}
                accessToken={session?.access_token}
                selectedTab={currentTab}
                onSelectedTabChange={setCurrentTab}
                isChatLoading={isLoading}
                isPreviewLoading={isPreviewLoading}
                fragment={fragment}
                result={result as ExecutionResult}
                onClose={() => setFragment(undefined)}
              />
            </div>
          </>
        )}
      </div>
    </main>
  )
}


// Persist successful builds to Supabase when enabled (best-effort)
async function persistBuild({
  fragment,
  result,
  userId,
  teamId,
  posthog,
}: {
  fragment: DeepPartial<FragmentSchema>
  result: ExecutionResult
  userId: string | null
  teamId: string | null
  posthog: ReturnType<typeof usePostHog>
}) {
  if (!supabase) return
  try {
    const payload: any = {
      user_id: userId,
      team_id: teamId,
      template: fragment.template ?? null,
      title: fragment.title ?? null,
      description: fragment.description ?? null,
      file_path: fragment.file_path ?? null,
      sbx_id: (result as any)?.sbxId ?? null,
      url:
        (result as any)?.template !== 'code-interpreter-v1'
          ? (result as any)?.url ?? null
          : null,
    }

    const { data: buildRow, error: buildError } = await supabase
      .from('builds')
      .insert(payload)
      .select('id')
      .single()

    if (buildError) throw buildError

    const buildId = (buildRow as any)?.id

    if (buildId && fragment.file_path && fragment.code) {
      await supabase.from('build_files').insert({
        build_id: buildId,
        file_path: fragment.file_path,
        content: fragment.code,
      } as any)
    }

    toast({ title: 'Saved build', description: 'Your fragment was saved.' })
    posthog?.capture('build_persisted', { build_id: buildId })
  } catch (err) {
    console.warn('Build persistence skipped or failed:', err)
  }
}

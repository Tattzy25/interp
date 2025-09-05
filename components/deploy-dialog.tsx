'use client'

import Logo from './logo'
import { CopyButton } from './ui/copy-button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { publish } from '@/app/actions/publish'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Duration } from '@/lib/duration'
import { FragmentSchema } from '@/lib/schema'
import { usePostHog } from 'posthog-js/react'
import { useEffect, useState } from 'react'
import { DeepPartial } from 'ai'
import { ExternalLink } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

export function DeployDialog({
  url,
  sbxId,
  teamID,
  accessToken,
  fragment,
}: {
  url: string
  sbxId: string
  teamID: string | undefined
  accessToken: string | undefined
  fragment?: DeepPartial<FragmentSchema>
}) {
  const posthog = usePostHog()

  const [publishedURL, setPublishedURL] = useState<string | null>(null)
  const [duration, setDuration] = useState<string | null>(null)
  const [deploymentType, setDeploymentType] = useState<'e2b' | 'vercel'>('e2b')
  const [vercelDeployUrl, setVercelDeployUrl] = useState<string | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)

  useEffect(() => {
    setPublishedURL(null)
    setVercelDeployUrl(null)
  }, [url])

  async function publishURL(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const { url: publishedURL } = await publish(
      url,
      sbxId,
      duration as Duration,
      teamID,
      accessToken,
    )
    setPublishedURL(publishedURL)
    posthog.capture('publish_url', {
      url: publishedURL,
    })
  }

  async function deployToVercel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!fragment) {
      toast({ title: 'Missing fragment', description: 'Nothing to deploy yet.', variant: 'destructive' })
      return
    }

    setIsDeploying(true)
    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fragment,
          sbxId,
        }),
      })

      const result = await response.json()
      if (response.ok) {
        setVercelDeployUrl(result.deployUrl)
        posthog.capture('vercel_deploy', {
          url: result.deployUrl,
        })
        toast({ title: 'Deployment started', description: 'Vercel deployment has been triggered.' })
      } else {
        throw new Error(result.message || 'Deployment failed')
      }
    } catch (error: any) {
      console.error('Vercel deployment error:', error)
      toast({ title: 'Vercel deploy failed', description: error.message || 'Unexpected error', variant: 'destructive' })
    } finally {
      setIsDeploying(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="default">
          <img 
            src="https://i.imgur.com/YjlgFGU.png" 
            alt="Code Homie" 
            className="w-4 h-4 mr-2"
          />
          Deploy
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="p-4 w-80 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="text-sm font-semibold">Deploy to Cloud</div>
          <div className="text-sm text-muted-foreground">
            Deploying your creation will make it publicly accessible to others via link.
          </div>
          <div className="text-sm text-muted-foreground">
            Your creation will be available up until the expiration date you choose.
          </div>
          <div className="text-sm text-muted-foreground">
            All new accounts receive generous free hosting credits. Upgrade to{' '}
            <a
              href="https://codehomie.chat"
              target="_blank"
              className="underline"
            >
              Pro tier
            </a>{' '}
            for longer expiration.
          </div>
          <form className="flex flex-col gap-2" onSubmit={publishURL}>
            {publishedURL ? (
              <div className="flex items-center gap-2">
                <Input value={publishedURL} readOnly />
                <CopyButton content={publishedURL} />
              </div>
            ) : (
              <Select onValueChange={(value) => setDuration(value)} required>
                <SelectTrigger>
                  <SelectValue placeholder="Set expiration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Expires in</SelectLabel>
                    <SelectItem value="30m">30 Minutes</SelectItem>
                    <SelectItem value="1h">1 Hour</SelectItem>
                    <SelectItem value="3h">3 Hours · Pro</SelectItem>
                    <SelectItem value="6h">6 Hours · Pro</SelectItem>
                    <SelectItem value="1d">1 Day · Pro</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
            <Button
              type="submit"
              variant="default"
              disabled={publishedURL !== null}
            >
              {publishedURL ? 'Deployed' : 'Accept and deploy'}
            </Button>
          </form>
        </div>

        <div className="border-t" />

        <div className="flex flex-col gap-2">
          <div className="text-sm font-semibold">Deploy to Vercel</div>
          <div className="text-sm text-muted-foreground">
            Trigger a Vercel deployment using your configured Deploy Hook.
          </div>
          <form className="flex flex-col gap-2" onSubmit={deployToVercel}>
            {vercelDeployUrl ? (
              <div className="flex items-center gap-2">
                <Input value={vercelDeployUrl} readOnly />
                <CopyButton content={vercelDeployUrl} />
                <Button asChild variant="ghost" size="icon">
                  <a href={vercelDeployUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            ) : (
              <Button type="submit" variant="secondary" disabled={isDeploying || !fragment}>
                {isDeploying ? 'Deploying…' : 'Trigger Vercel Deploy'}
              </Button>
            )}
          </form>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

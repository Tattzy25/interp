import Auth, { ViewType } from './auth'
import Logo from './logo'
import { validateEmail } from '@/app/actions/validate-email'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { SupabaseClient } from '@supabase/supabase-js'

export function AuthDialog({
  open,
  setOpen,
  supabase,
  view,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  supabase: SupabaseClient
  view: ViewType
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <VisuallyHidden>
          <DialogTitle>Sign in to Code Homie</DialogTitle>
          <DialogDescription>
            Sign in or create an account to access Code Homie
          </DialogDescription>
        </VisuallyHidden>
        <div className="flex justify-center items-center flex-col">
          <h1 className="flex items-center gap-4 text-xl font-bold mb-6 w-full">
            <img 
              src="https://i.imgur.com/YjlgFGU.png" 
              alt="Code Homie" 
              className="w-10 h-10"
            />
            Sign in to Code Homie
          </h1>
          <div className="w-full">
            <Auth
              supabaseClient={supabase}
              view="magic_link"
              providers={[]}
              onlyThirdPartyProviders={false}
              magicLink={true}
              onSignUpValidate={validateEmail}
              metadata={{
                is_codehomie_user: true,
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

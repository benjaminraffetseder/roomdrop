import { SessionEnded } from "@/components/roomdrop/session-ended"
import { SettingsDialog } from "@/components/roomdrop/settings-dialog"
import { ShareSetup } from "@/components/roomdrop/share-setup"
import { SharingSession } from "@/components/roomdrop/sharing-session"
import { Button } from "@/components/ui/button"
import { useRoomDrop } from "@/hooks/use-roomdrop"
import { Square, X } from "lucide-react"
import roomdropIcon from "../../assets/icon.svg"

export function App() {
  const app = useRoomDrop()
  const session = app.session
  const active = session?.state === "sharing"
  return (
    <div className="mx-auto flex min-h-svh max-w-[700px] flex-col px-[34px] narrow:px-[23px] wide:px-11">
      <header className="flex h-[83px] shrink-0 items-center justify-between gap-4 border-b border-border narrow:h-[70px] wide:h-[91px] compact:h-[70px]">
        <div className="flex items-center gap-2.5 text-[22px] font-[650] tracking-[-1px]">
          <img
            className="block size-[35px] shrink-0"
            src={roomdropIcon}
            width={35}
            height={35}
            alt=""
          />
          <span>RoomDrop</span>
        </div>
        <div className="flex items-center gap-2.5">
          {active && (
            <Button
              variant="stop"
              size="stop"
              onClick={() => void app.stop()}
              disabled={app.busy}
              title="Stop sharing and close the link"
            >
              <Square size={11} fill="currentColor" aria-hidden="true" />
              Stop sharing
            </Button>
          )}
          <SettingsDialog app={app} active={active} />
        </div>
      </header>
      <main className="flex-1 pt-[30px] pb-5 narrow:pt-[25px] wide:pt-10 compact:pt-[23px]">
        {!session ? (
          <ShareSetup app={app} />
        ) : active ? (
          <SharingSession app={app} session={session} />
        ) : (
          <SessionEnded app={app} session={session} />
        )}
        {app.error && (
          <div
            className="mt-[15px] flex items-start justify-between gap-2 rounded-[9px] border border-error-border bg-error p-3 pl-[15px] text-xs leading-[1.6] text-error-foreground"
            role="alert"
          >
            <span>{app.error}</span>
            <Button
              variant="plain"
              size="icon"
              className="size-[22px] shrink-0"
              aria-label="Dismiss error"
              onClick={() => app.setError("")}
            >
              <X size={15} />
            </Button>
          </div>
        )}
      </main>
      <div className="sr-only" role="status" aria-live="polite">
        {app.copied ? "Sharing link copied to clipboard." : ""}
      </div>
    </div>
  )
}

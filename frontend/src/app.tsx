import { ReceiveSetup } from "@/components/roomdrop/receive-setup"
import { SessionEnded } from "@/components/roomdrop/session-ended"
import { SettingsDialog } from "@/components/roomdrop/settings-dialog"
import { ShareSetup } from "@/components/roomdrop/share-setup"
import { SharingSession } from "@/components/roomdrop/sharing-session"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRoomDrop } from "@/hooks/use-roomdrop"
import { ArrowDownToLine, ArrowUpFromLine, Square, X } from "lucide-react"
import roomdropIcon from "../../assets/icon.svg"

export function App() {
  const app = useRoomDrop()
  const session = app.session
  const active = session?.state === "sharing"
  const sessionContent = session ? (
    active ? (
      <SharingSession app={app} session={session} />
    ) : (
      <SessionEnded app={app} session={session} />
    )
  ) : null
  return (
    <Tabs
      value={app.mode}
      onValueChange={(value) => {
        if (value === "send" || value === "receive") app.setMode(value)
      }}
      className="mx-auto min-h-svh max-w-[700px] gap-0 px-[34px] narrow:px-[23px] wide:px-11"
    >
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
              title="Stop the session and close the link"
            >
              <Square size={11} fill="currentColor" aria-hidden="true" />
              {session.mode === "receive" ? "Stop receiving" : "Stop sharing"}
            </Button>
          )}
          <SettingsDialog app={app} active={active} />
        </div>
      </header>
      <main className="flex-1 pt-[30px] pb-[calc(64px+env(safe-area-inset-bottom))] narrow:pt-[25px] wide:pt-10 compact:pt-[23px]">
        <TabsContent value="send">
          {sessionContent ?? <ShareSetup app={app} />}
        </TabsContent>
        <TabsContent value="receive">
          {sessionContent ?? <ReceiveSetup app={app} />}
        </TabsContent>
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
      <nav
        className="fixed inset-x-0 bottom-0 z-5 border-t border-border/70 bg-background pb-[env(safe-area-inset-bottom)]"
        aria-label="Transfer modes"
      >
        <div className="mx-auto max-w-[700px] px-[34px] py-1.5 narrow:px-[23px] wide:px-11">
          <TabsList
            variant="navigation"
            className="mx-auto flex w-full max-w-[240px]"
            aria-label="Transfer mode"
          >
            <TabsTrigger
              value="send"
              disabled={app.busy || (active && app.mode !== "send")}
            >
              <ArrowUpFromLine aria-hidden="true" />
              Send
            </TabsTrigger>
            <TabsTrigger
              value="receive"
              disabled={app.busy || (active && app.mode !== "receive")}
            >
              <ArrowDownToLine aria-hidden="true" />
              Receive
            </TabsTrigger>
          </TabsList>
        </div>
      </nav>
      <div className="sr-only" role="status" aria-live="polite">
        {app.copied ? "Sharing link copied to clipboard." : ""}
      </div>
    </Tabs>
  )
}

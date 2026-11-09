import { Button } from "@/components/ui/button"
import type { RoomDropController, Snapshot } from "@/hooks/use-roomdrop"
import { cn } from "@/lib/utils"
import { ArrowRight, Check, Clock3, Unplug } from "lucide-react"
import { TransferActivity } from "./transfer-activity"

export function SessionEnded({
  app,
  session,
}: {
  app: Pick<RoomDropController, "reset" | "busy">
  session: Snapshot
}) {
  return (
    <>
      <section className="px-[15px] py-8 text-center">
        <span
          className={cn(
            "mx-auto mb-5 grid size-14 place-items-center rounded-2xl border",
            session.state === "downloaded"
              ? "border-complete-border bg-complete text-complete-foreground"
              : "border-ended-border bg-ended text-ended-foreground",
          )}
        >
          {session.state === "downloaded" ? (
            <Check size={32} strokeWidth={1.5} />
          ) : session.state === "expired" ? (
            <Clock3 size={32} strokeWidth={1.5} />
          ) : (
            <Unplug size={32} strokeWidth={1.5} />
          )}
        </span>
        <h1 className="text-2xl leading-[1.3] font-[550] tracking-[-0.6px]">
          {session.state === "downloaded"
            ? "Transfer complete"
            : session.state === "expired"
              ? "Session expired"
              : session.state === "error"
                ? "Connection closed"
                : "Sharing stopped"}
        </h1>
        <p
          className={cn(
            "text-[13px] leading-[1.7] tracking-[0.05px] text-description",
            "mx-auto mt-2 max-w-[310px]",
          )}
        >
          This link is no longer active.
        </p>
        <div className="flex justify-center gap-[15px] pt-[25px] pb-7 text-[10px] text-ended-meta [&>span+span]:before:mr-[15px] [&>span+span]:before:content-['·']">
          <span>
            {session.items.length}{" "}
            {session.items.length === 1 ? "item" : "items"}
          </span>
          <span>
            {session.downloads}{" "}
            {session.downloads === 1
              ? "completed transfer"
              : "completed transfers"}
          </span>
        </div>
        <Button
          variant="default"
          size="default"
          className={cn("flex w-full", "mx-auto max-w-[290px]")}
          onClick={() => void app.reset()}
          disabled={app.busy}
        >
          Share more files
          <ArrowRight size={18} />
        </Button>
      </section>
      {session.transfers.length > 0 && <TransferActivity session={session} />}
    </>
  )
}

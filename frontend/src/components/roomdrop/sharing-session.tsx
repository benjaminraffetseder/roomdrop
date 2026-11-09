import { Button } from "@/components/ui/button"
import type { RoomDropController, Snapshot } from "@/hooks/use-roomdrop"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Check, Clock3, Copy, Link2 } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useEffect, useState } from "react"
import { FileList } from "./file-list"
import { TransferActivity } from "./transfer-activity"

function Countdown({ expiresAt }: { expiresAt: string | Date }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const end =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : new Date(expiresAt).getTime()
  const seconds = Math.max(0, Math.ceil((end - now) / 1000))
  return (
    <span className="text-countdown tabular-nums">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
  )
}

export function SharingSession({
  app,
  session,
}: {
  app: Pick<RoomDropController, "copy" | "copied" | "busy">
  session: Snapshot
}) {
  return (
    <>
      <section className="mb-5 wide:mb-[31px] compact:mb-[22px]">
        <h1 className="text-2xl leading-[1.3] font-[550] tracking-[-0.6px]">
          Sharing files
        </h1>
        <p
          className={cn(
            "text-[13px] leading-[1.7] tracking-[0.05px] text-description",
            "mt-2",
          )}
        >
          Keep RoomDrop open while they download.
        </p>
      </section>

      <section
        className="rounded-[14px] border border-share-border bg-card px-[21px] pt-[21px] pb-[13px] shadow-share narrow:px-3.5 narrow:pt-4 narrow:pb-3"
        aria-label="Share this session"
      >
        <div className="flex items-center justify-between gap-[18px] pb-[21px] narrow:gap-2.5">
          <div>
            <h2 className="mb-2 text-[17px] font-[550] tracking-[-0.3px]">
              Download link
            </h2>
            <p className="text-[11px] leading-[1.7] text-share-description narrow:text-[10px]">
              Scan the QR code or open the link
              <br />
              on the same local network.
            </p>
          </div>
          <div className="grid shrink-0 place-items-center rounded-[10px] border border-qr-border bg-card p-[7px] narrow:p-1">
            <QRCodeSVG
              className="block h-auto max-w-full narrow:w-[119px]"
              value={session.url}
              size={142}
              level="M"
              marginSize={1}
              fgColor="var(--qr-foreground)"
              bgColor="var(--qr-background)"
              title="Scan to open this RoomDrop session"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-share-link-border bg-share-link p-[7px] pl-2.5 text-share-link-icon narrow:gap-[5px]">
          <Link2 size={16} />
          <input
            className="w-0 min-w-0 flex-1 border-0 bg-transparent px-0 py-1 font-code text-[10px] text-ellipsis text-share-link-foreground outline-none focus:text-clip focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring narrow:text-[9px]"
            value={session.url}
            readOnly
            aria-label="Your local sharing URL"
            onFocus={(event) => event.target.select()}
            spellCheck={false}
          />
          <Button
            variant="secondary"
            size="copy"
            onClick={() => void app.copy()}
            disabled={app.busy}
            data-copied={app.copied}
            aria-label={app.copied ? "Link copied" : "Copy sharing link"}
          >
            {app.copied ? <Check size={15} /> : <Copy size={15} />}
            {app.copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2.5 text-[9px] text-share-expiry">
          <span className="flex items-center gap-[5px]">
            <Clock3 size={13} />
            Link closes in <Countdown expiresAt={session.expiresAt} />
          </span>
          {session.once && (
            <span className="rounded bg-badge px-1.5 py-[3px] text-[8px] text-badge-foreground">
              One download
            </span>
          )}
        </div>
      </section>

      <section className="mt-[23px]">
        <div className="mb-2.5 flex items-center justify-between gap-2.5 text-[9px] text-section-meta">
          <h2 className="text-[10px] font-semibold text-section-heading">
            Shared files
          </h2>
          <span className="text-right">
            {session.items.length}{" "}
            {session.items.length === 1 ? "item" : "items"} ·{" "}
            {formatBytes(session.size)}
            {session.items.length > 1 || session.items[0]?.folder ? " ZIP" : ""}
          </span>
        </div>
        <FileList files={session.items} className="max-h-[125px]" />
      </section>
      <TransferActivity session={session} />
    </>
  )
}

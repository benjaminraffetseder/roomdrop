import type { Snapshot } from "@/hooks/use-roomdrop"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Check, Laptop, Monitor, Smartphone } from "lucide-react"

const activityGlyph =
  "grid size-[33px] shrink-0 place-items-center rounded-[9px] border border-activity-border bg-activity text-activity-icon"

export function TransferActivity({ session }: { session: Snapshot }) {
  const transfers = session.transfers.slice().reverse()
  return (
    <section
      className="mt-[23px] border-t border-border pt-[18px]"
      aria-labelledby="activity-title"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2.5 text-[9px] text-section-meta">
        <h2
          className="text-[10px] font-semibold text-section-heading"
          id="activity-title"
        >
          Transfer activity
        </h2>
        <span className="text-right">
          {session.visitors
            ? `${session.visitors} ${session.visitors === 1 ? "visitor" : "visitors"}`
            : ""}
        </span>
      </div>
      {transfers.length === 0 ? (
        <div className="flex items-center gap-[11px] py-2">
          <span className={activityGlyph}>
            <Monitor size={19} strokeWidth={1.5} />
          </span>
          <div>
            <strong className="block text-[10px] font-medium text-activity-foreground">
              {session.visitors ? "Link opened" : "No downloads yet"}
            </strong>
            {session.visitors > 0 && (
              <p className="mt-1 text-[9px] leading-[1.7] text-activity-meta">
                Waiting for a download.
              </p>
            )}
          </div>
        </div>
      ) : (
        <ul className="max-h-44 overflow-auto">
          {transfers.map((transfer) => {
            const percent = transfer.total
              ? Math.min(
                  100,
                  Math.round((transfer.bytes / transfer.total) * 100),
                )
              : transfer.state === "complete"
                ? 100
                : 0
            const Icon = /iPhone|iPad|Android/.test(transfer.device)
              ? Smartphone
              : Laptop
            return (
              <li
                key={transfer.id}
                className="flex items-start gap-[11px] py-2.5"
              >
                <span
                  className={cn(
                    activityGlyph,
                    transfer.state === "complete" &&
                      "border-success-border bg-success text-success-foreground",
                  )}
                >
                  {transfer.state === "complete" ? (
                    <Check size={18} />
                  ) : (
                    <Icon size={18} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="block text-[10px] font-medium text-activity-foreground [overflow-wrap:anywhere]">
                      {transfer.device}
                    </strong>
                    <span className="text-[9px] whitespace-nowrap text-activity-status">
                      {transfer.state === "complete"
                        ? "Sent"
                        : transfer.state === "interrupted"
                          ? "Interrupted"
                          : `${percent}%`}
                    </span>
                  </div>
                  <p className="mt-1 text-[9px] leading-[1.7] text-activity-meta">
                    {transfer.state === "sending"
                      ? `${formatBytes(transfer.bytes)} of ${formatBytes(transfer.total)}`
                      : transfer.state === "complete"
                        ? `${formatBytes(transfer.total)} sent to browser`
                        : "The download didn’t finish."}
                  </p>
                  {transfer.state === "sending" && (
                    <div
                      className="mt-2 h-[3px] w-full overflow-hidden rounded-[2px] bg-progress-track"
                      role="progressbar"
                      aria-label={`Sending to ${transfer.device}`}
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span
                        className="block size-full origin-left bg-progress transition-transform duration-200 ease-linear"
                        style={{ transform: `scaleX(${percent / 100})` }}
                      />
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

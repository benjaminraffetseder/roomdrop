import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { RoomDropController } from "@/hooks/use-roomdrop"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  ArrowDown,
  ArrowRight,
  Clock3,
  FolderPlus,
  Link2,
  LoaderCircle,
  Monitor,
  Plus,
} from "lucide-react"
import { useState } from "react"
import { FileList } from "./file-list"

const durations = [5, 15, 30, 60].map((value) => ({
  value,
  label: value === 60 ? "1 hour" : `${value} minutes`,
}))

export function ShareSetup({ app }: { app: RoomDropController }) {
  const [dragging, setDragging] = useState(false)
  const total = app.files.reduce((sum, file) => sum + file.size, 0)
  return (
    <>
      <section className="mb-5 wide:mb-[31px] compact:mb-[22px]">
        <h1 className="text-2xl leading-[1.3] font-[550] tracking-[-0.6px]">
          Share files
        </h1>
      </section>

      {!app.desktop && (
        <div className="mb-4 flex items-center gap-2.5 rounded-[9px] border border-warning-border bg-warning px-[13px] py-[11px] text-[11px] leading-[1.6] text-warning-foreground">
          <Monitor size={17} />
          <span>Open the desktop app to share files.</span>
        </div>
      )}

      <section
        className={cn(
          "relative isolate rounded-[15px] border-[1.5px] border-dashed border-drop-border bg-drop px-[15px] pt-[25px] pb-[19px] text-center transition-[background-color,border-color] duration-160 ease-[ease] before:pointer-events-none before:absolute before:inset-[5px] before:-z-10 before:rounded-[11px] before:border before:border-drop-detail before:content-[''] [&.file-drop-target-active]:border-drop-active-border [&.file-drop-target-active]:bg-drop-active narrow:px-2 wide:pt-[35px] wide:pb-[25px] compact:pt-[19px] compact:pb-4",
          dragging && "border-drop-active-border bg-drop-active",
        )}
        data-file-drop-target={!app.busy && app.desktop ? "true" : undefined}
        onDragOver={(event) => {
          event.preventDefault()
          if (!app.busy) setDragging(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
        }}
      >
        <div
          className={cn(
            "pointer-events-none relative mx-auto mb-3.5 h-[78px] w-[98px] transition-transform duration-180 ease-out compact:mb-2 compact:h-[69px]",
            dragging && "[transform:translateY(-5px)_rotate(-3deg)]",
          )}
          aria-hidden="true"
        >
          <span className="absolute top-[17px] left-[23px] h-[43px] w-14 -rotate-9 rounded-[7px] border border-art-folder-back-border bg-art-folder-back before:absolute before:-top-1.5 before:left-1 before:h-[9px] before:w-[22px] before:rounded-t before:border before:border-b-0 before:border-art-folder-back-border before:bg-art-folder-back before:content-['']" />
          <span className="absolute top-px left-[35px] flex h-[47px] w-[34px] rotate-8 flex-col gap-[5px] rounded border border-art-file-border bg-art-file px-[7px] py-[13px]">
            <span className="h-0.5 w-full rounded-[1px] bg-art-file-line" />
            <span className="h-0.5 w-full rounded-[1px] bg-art-file-line" />
            <span className="h-0.5 w-3/5 rounded-[1px] bg-art-file-line" />
          </span>
          <span className="absolute top-[29px] left-[22px] grid h-10 w-[58px] -rotate-4 place-items-center rounded-t rounded-b-[7px] border border-art-folder-front-border bg-art-folder-front text-art-foreground shadow-art">
            <ArrowDown size={25} strokeWidth={1.6} />
          </span>
          <span className="absolute top-1 left-3.5 text-[17px] font-light text-art-spark">
            +
          </span>
          <span className="absolute top-[42px] right-px text-[12px] font-light text-art-spark">
            +
          </span>
        </div>
        <h2 className="mb-[7px] text-[16px] font-[550] tracking-[-0.4px] narrow:text-[14px]">
          {app.preparing
            ? "Preparing files…"
            : dragging
              ? "Drop to share"
              : "Drop files or folders"}
        </h2>
        <p className="text-[11px] leading-[1.6] text-drop-description narrow:text-[10px]">
          {app.preparing
            ? "Creating your sharing link."
            : "Or choose them below."}
        </p>
        <div className="mt-[18px] flex items-center justify-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void app.selectFiles()}
            disabled={!app.desktop || app.busy}
          >
            {app.preparing ? (
              <LoaderCircle
                className="animate-[spin_800ms_linear_infinite]"
                size={16}
              />
            ) : (
              <Plus size={16} />
            )}
            Choose files
          </Button>
          <span className="text-[10px] text-separator-label">or</span>
          <Button
            variant="link"
            size="none"
            className="gap-1 [&>svg:first-child]:hidden"
            onClick={() => void app.selectFiles(true)}
            disabled={!app.desktop || app.busy}
          >
            <FolderPlus size={15} />
            Choose folder
          </Button>
        </div>
        {app.preparing && (
          <Button
            variant="link"
            size="none"
            className="mx-auto mt-4 flex"
            onClick={() => void app.stop()}
          >
            Cancel preparation
          </Button>
        )}
      </section>

      {app.files.length > 0 && (
        <section className="mt-[23px]">
          <div className="mb-2.5 flex items-center justify-between gap-2.5 text-[9px] text-section-meta">
            <h2 className="text-[10px] font-semibold text-section-heading">
              Ready to share
            </h2>
            <span className="text-right">
              {app.files.length} {app.files.length === 1 ? "item" : "items"} ·{" "}
              {formatBytes(total)}
            </span>
          </div>
          <FileList
            files={app.files}
            remove={(path) => void app.remove(path)}
            disabled={app.busy}
          />
          <Button
            variant="default"
            size="default"
            className="mt-3.5 flex w-full"
            disabled={app.busy || !app.address}
            onClick={() => void app.start()}
          >
            Create sharing link
            <ArrowRight size={17} />
          </Button>
        </section>
      )}

      <section
        className="mt-6 rounded-[11px] border border-border bg-popover px-[17px] narrow:px-3 compact:mt-5"
        aria-label="Session settings"
      >
        <div
          className={cn(
            "flex min-h-[66px] items-center gap-3 narrow:gap-[9px] compact:min-h-[60px]",
            "border-b border-muted",
          )}
        >
          <span className="inline-flex w-[21px] text-setting-icon">
            <Clock3 size={19} strokeWidth={1.6} />
          </span>
          <div className="flex-1">
            <label
              className="text-[11px] font-[550] text-setting-foreground narrow:text-[10px]"
              id="duration-label"
              htmlFor="duration"
            >
              Link expires after
            </label>
          </div>
          <Select
            items={durations}
            value={app.minutes}
            disabled={app.busy}
            onValueChange={(value) => {
              if (value !== null) app.setMinutes(value)
            }}
          >
            <SelectTrigger
              id="duration"
              aria-labelledby="duration-label"
              className="min-w-[105px] text-[10px]"
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectGroup>
                {durations.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-h-[66px] items-center gap-3 narrow:gap-[9px] compact:min-h-[60px]">
          <span className="inline-flex w-[21px] text-setting-icon">
            <Link2 size={19} strokeWidth={1.6} />
          </span>
          <div className="flex-1">
            <label
              className="text-[11px] font-[550] text-setting-foreground narrow:text-[10px]"
              htmlFor="one-time"
            >
              One-time download
            </label>
            <span className="mt-[3px] block text-[9px] leading-normal text-setting-description narrow:text-[8px]">
              Close the link after the first complete transfer.
            </span>
          </div>
          <Switch
            id="one-time"
            checked={app.once}
            disabled={app.busy}
            onCheckedChange={(checked) => app.setOnce(checked)}
            aria-label="Expire after one completed download"
          />
        </div>
      </section>
    </>
  )
}

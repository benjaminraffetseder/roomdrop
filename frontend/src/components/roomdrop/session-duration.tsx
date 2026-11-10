import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { RoomDropController } from "@/hooks/use-roomdrop"
import { Clock3 } from "lucide-react"

const durations = [5, 15, 30, 60].map((value) => ({
  value,
  label: value === 60 ? "1 hour" : `${value} minutes`,
}))

export function SessionDuration({ app }: { app: RoomDropController }) {
  return (
    <div className="flex min-h-[66px] items-center gap-3 narrow:gap-[9px] compact:min-h-[60px]">
      <span className="inline-flex w-[21px] text-setting-icon">
        <Clock3 size={19} strokeWidth={1.6} />
      </span>
      <label
        className="flex-1 text-[11px] font-[550] text-setting-foreground narrow:text-[10px]"
        id="duration-label"
        htmlFor="duration"
      >
        Link expires after
      </label>
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
  )
}

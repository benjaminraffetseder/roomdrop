import { Button } from "@/components/ui/button"
import type { Item } from "@/hooks/use-roomdrop"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  File,
  FileArchive,
  FileImage,
  FileMusic,
  FileText,
  Film,
  Folder,
  X,
} from "lucide-react"

function FileIcon({ item }: { item: Item }) {
  const extension = item.name.split(".").pop()?.toLowerCase() ?? ""
  const Icon = item.folder
    ? Folder
    : /^(png|jpe?g|gif|webp|svg|heic|avif)$/.test(extension)
      ? FileImage
      : /^(zip|rar|7z|tar|gz)$/.test(extension)
        ? FileArchive
        : /^(mp4|mov|avi|mkv|webm)$/.test(extension)
          ? Film
          : /^(mp3|wav|flac|m4a)$/.test(extension)
            ? FileMusic
            : /^(pdf|txt|md|docx?|rtf)$/.test(extension)
              ? FileText
              : File
  return (
    <span
      className={cn(
        "grid h-[38px] w-[34px] shrink-0 place-items-center rounded-[7px]",
        !item.folder && extension === "pdf"
          ? "bg-pdf text-pdf-foreground"
          : "bg-file text-file-icon",
      )}
    >
      <Icon size={20} strokeWidth={1.5} />
    </span>
  )
}

export function FileList({
  files,
  remove,
  className,
  disabled = false,
}: {
  files: Item[]
  remove?: (path: string) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <ul className={cn("max-h-[165px] overflow-auto", className)}>
      {files.map((file) => (
        <li
          key={file.path}
          className="flex items-center gap-[11px] border-b border-muted py-[11px] last:border-b-0"
        >
          <FileIcon item={file} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span
              className="truncate text-[11px] font-[550] text-file-name"
              title={file.name}
            >
              {file.name}
            </span>
            <span className="text-[9px] text-file-meta">
              {file.folder
                ? `Folder${file.size ? ` · ${formatBytes(file.size)}` : ""}`
                : formatBytes(file.size)}
            </span>
          </span>
          {remove && (
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={`Remove ${file.name}`}
              onClick={() => remove(file.path)}
            >
              <X size={15} />
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

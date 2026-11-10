import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { RoomDropController } from "@/hooks/use-roomdrop"
import { ArrowDownToLine, FolderOpen } from "lucide-react"
import { SessionDuration } from "./session-duration"

export function ReceiveSetup({ app }: { app: RoomDropController }) {
  return (
    <>
      <section className="mb-5 wide:mb-[31px] compact:mb-[22px]">
        <h1 className="text-2xl leading-[1.3] font-[550] tracking-[-0.6px]">
          Receive files
        </h1>
        <p className="mt-2 text-[13px] leading-[1.7] text-description">
          Send photos and files to this computer from another device’s browser.
        </p>
      </section>
      <FieldGroup className="rounded-[15px] border border-border bg-card p-5">
        <Field data-disabled={!app.desktop || app.busy || undefined}>
          <FieldLabel htmlFor="receive-destination">
            Save received files to
          </FieldLabel>
          <Input
            id="receive-destination"
            value={app.destination}
            placeholder="Choose a destination folder"
            readOnly
            aria-describedby="receive-folder-help"
          />
          <FieldDescription id="receive-folder-help">
            Existing files are kept. Duplicate names get a numbered copy.
          </FieldDescription>
          <Button
            variant="outline"
            size="sm"
            disabled={!app.desktop || app.busy}
            onClick={() => void app.chooseReceiveFolder()}
          >
            <FolderOpen data-icon="inline-start" />
            {app.destination ? "Change folder" : "Choose folder"}
          </Button>
        </Field>
      </FieldGroup>
      <section
        className="mt-6 rounded-[11px] border border-border bg-popover px-[17px] narrow:px-3 compact:mt-5"
        aria-label="Session settings"
      >
        <SessionDuration app={app} />
      </section>
      <p className="mt-4 text-[11px] leading-[1.7] text-description">
        Anyone with the link on your local network can send files to this folder
        until the session ends. Up to 10 GiB per file.
      </p>
      {!app.desktop && (
        <p className="mt-3 text-[11px] text-warning-foreground">
          Open the desktop app to receive files.
        </p>
      )}
      <Button
        className="mt-5 w-full"
        disabled={!app.desktop || app.busy || !app.destination || !app.address}
        onClick={() => void app.startReceive()}
      >
        <ArrowDownToLine data-icon="inline-start" />
        Start receiving
      </Button>
    </>
  )
}

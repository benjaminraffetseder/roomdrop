import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { RoomDropController } from "@/hooks/use-roomdrop"
import { errorMessage } from "@/lib/format"
import { CheckForUpdates } from "@wails/app"
import { RefreshCw, Settings, Wifi } from "lucide-react"
import { useState } from "react"
import thirdPartyNotices from "../../../../THIRD_PARTY_NOTICES.md?raw"
import { version } from "../../../package.json"

const helpStep =
  "mt-3 flex items-baseline gap-3 text-[11px] leading-[1.7] text-settings-step"

export function SettingsDialog({
  app,
  active,
}: {
  app: Pick<
    RoomDropController,
    | "networks"
    | "address"
    | "setAddress"
    | "desktop"
    | "busy"
    | "device"
    | "refreshNetworks"
  >
  active: boolean
}) {
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updateError, setUpdateError] = useState("")
  async function checkForUpdates() {
    if (!app.desktop || checkingUpdates) return
    setCheckingUpdates(true)
    setUpdateError("")
    try {
      await CheckForUpdates()
    } catch (error) {
      setUpdateError(errorMessage(error))
    } finally {
      setCheckingUpdates(false)
    }
  }
  const networks = app.networks.map((network) => ({
    value: network.address,
    label: `${network.name} · ${network.address}`,
  }))
  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="subtle" size="icon" />}
        aria-label="Settings"
      >
        <Settings size={19} strokeWidth={1.6} />
      </DialogTrigger>
      <DialogContent closeLabel="Close settings">
        <span className="mb-5 grid size-11 place-items-center rounded-[13px] bg-settings-icon-surface text-settings-icon">
          <Settings size={24} strokeWidth={1.4} />
        </span>
        <DialogTitle className="max-w-[280px] text-[21px] leading-[1.3] font-[550] tracking-[-0.6px]">
          Settings
        </DialogTitle>
        <DialogDescription className="mt-3 text-xs leading-[1.8] text-dialog-description">
          Local sharing and connections.
        </DialogDescription>
        <ol className="my-[23px] list-none p-0">
          <li className={helpStep}>
            <span className="font-mono text-[10px] text-settings-step-number">
              01
            </span>
            Set the expiration and choose files or a folder.
          </li>
          <li className={helpStep}>
            <span className="font-mono text-[10px] text-settings-step-number">
              02
            </span>
            Open the link on the receiving device.
          </li>
          <li className={helpStep}>
            <span className="font-mono text-[10px] text-settings-step-number">
              03
            </span>
            Stop sharing to revoke the link.
          </li>
        </ol>
        <div className="border-y border-settings-border py-[18px]">
          <label
            className="mb-[9px] block text-[10px] text-settings-foreground [overflow-wrap:anywhere]"
            id="network-label"
            htmlFor="network"
          >
            Share from {app.device}
          </label>
          <Select
            items={networks}
            value={app.address || null}
            disabled={
              !app.desktop || active || app.busy || networks.length === 0
            }
            onValueChange={(value) => {
              if (value !== null) app.setAddress(value)
            }}
          >
            <SelectTrigger
              id="network"
              aria-labelledby="network-label"
              className="w-full text-[11px]"
            >
              <SelectValue placeholder="No local network found" />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {networks.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {!active && app.desktop && (
            <Button
              variant="link"
              size="none"
              className="mt-[7px] text-[10px]"
              onClick={() => void app.refreshNetworks()}
              disabled={app.busy}
            >
              <RefreshCw size={13} />
              Refresh connections
            </Button>
          )}
        </div>
        <div className="mt-5 flex items-start gap-[11px] text-help-icon">
          <Wifi className="mt-0.5" size={17} />
          <p className="text-[10px] leading-[1.8] text-help-foreground">
            Can’t connect? Check that both devices use the same network, allow
            RoomDrop through your firewall on private networks, and turn off
            Wi-Fi client isolation. Guest networks and VPNs may prevent
            transfers.
          </p>
        </div>
        <p className="mt-[17px] text-[9px] leading-[1.8] text-fineprint">
          Anyone with the link on your network can download. Local HTTP
          transfers are not encrypted. Closing the window stops sharing and
          leaves RoomDrop in the tray. Choose Quit RoomDrop in the tray menu to
          exit. A completed transfer means sent to the browser, not confirmation
          that the file was saved.
        </p>
        <details className="mt-[18px] text-[10px] text-settings-foreground">
          <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            Open-source licenses
          </summary>
          <pre
            className="max-h-[220px] overflow-auto rounded-lg border border-border p-3 font-code text-[10px] leading-[1.6] whitespace-pre-wrap [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            tabIndex={0}
            aria-label="Third-party license notices"
          >
            {thirdPartyNotices}
          </pre>
        </details>
        <div className="mt-[25px] flex items-center justify-between gap-2.5 text-[8px] text-settings-footer narrow:flex-wrap">
          <span>RoomDrop {version}</span>
          <Button
            variant="link"
            size="none"
            disabled={!app.desktop || checkingUpdates}
            aria-busy={checkingUpdates}
            onClick={() => void checkForUpdates()}
          >
            {checkingUpdates ? "Checking for updates…" : "Check for updates"}
          </Button>
        </div>
        {updateError && (
          <p role="alert" className="mt-2 text-[10px] text-destructive">
            {updateError}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

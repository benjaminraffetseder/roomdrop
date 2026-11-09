import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeLabel = "Close",
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  closeLabel?: string
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-overlay"
        className="fixed inset-0 z-10 bg-overlay opacity-100 backdrop-blur-[3px] transition-opacity duration-160 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0"
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-11 max-h-[calc(100svh-50px)] w-[calc(100%-40px)] max-w-[435px] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[17px] border border-dialog-border bg-background p-7 opacity-100 shadow-dialog outline-none transition-opacity duration-160 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0 narrow:p-6",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3.5 right-3.5"
              />
            }
            aria-label={closeLabel}
          >
            <X size={18} />
          </DialogClose>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "max-w-[280px] text-[21px] leading-[1.3] font-[550] tracking-[-0.6px]",
        className,
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "mt-3 text-xs leading-[1.8] text-dialog-description",
        className,
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
}

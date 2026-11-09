import { cn } from "@/lib/utils"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group/switch relative inline-flex h-[18px] w-[31px] shrink-0 cursor-pointer items-center rounded-[20px] border-0 bg-switch-off p-[3px] after:absolute after:-inset-x-[5px] after:-inset-y-2.5 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring data-checked:bg-switch-on data-disabled:cursor-default data-disabled:opacity-[0.46]",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3 rounded-full bg-switch-thumb shadow-switch transition-transform duration-160 ease-out data-checked:translate-x-[13px]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

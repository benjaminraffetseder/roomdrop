import { cn } from "@/lib/utils"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className,
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center gap-1 rounded-[10px] text-description group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default:
          "border border-outline-border bg-input-surface p-[3px] shadow-control group-data-horizontal/tabs:h-9",
        line: "rounded-none bg-transparent group-data-horizontal/tabs:h-9",
        navigation:
          "rounded-none bg-transparent group-data-horizontal/tabs:h-7",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-full min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border border-transparent px-3 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors duration-150 ease-out group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:transition-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
        "group-data-[variant=default]/tabs-list:hover:bg-accent group-data-[variant=default]/tabs-list:data-active:border-primary-border group-data-[variant=default]/tabs-list:data-active:bg-primary group-data-[variant=default]/tabs-list:data-active:text-primary-foreground group-data-[variant=default]/tabs-list:data-active:shadow-switch group-data-[variant=default]/tabs-list:data-active:hover:bg-primary-hover",
        "group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:hover:text-foreground group-data-[variant=line]/tabs-list:data-active:text-foreground",
        "group-data-[variant=navigation]/tabs-list:font-medium group-data-[variant=navigation]/tabs-list:hover:bg-input-surface group-data-[variant=navigation]/tabs-list:data-active:bg-accent/50 group-data-[variant=navigation]/tabs-list:data-active:text-accent-foreground group-data-[variant=navigation]/tabs-list:data-active:hover:bg-accent",
        "after:absolute after:bg-primary after:opacity-0 group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-0 group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, tabsListVariants, TabsTrigger }

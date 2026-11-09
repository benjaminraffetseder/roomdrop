import { cn } from "@/lib/utils"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center border [transition:background-color_140ms_ease,color_140ms_ease,transform_120ms_var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-safe:active:enabled:[transform:scale(0.97)] disabled:pointer-events-none disabled:cursor-default disabled:opacity-[0.46] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-primary-border bg-primary text-primary-foreground hover:bg-primary-hover",
        outline:
          "border-outline-border bg-card text-outline-foreground shadow-control hover:border-outline-hover-border hover:bg-outline-hover",
        secondary:
          "border-secondary-border bg-secondary text-secondary-foreground hover:border-secondary-active-border hover:bg-secondary-active data-[copied=true]:border-secondary-active-border data-[copied=true]:bg-secondary-active",
        ghost:
          "border-0 bg-transparent text-icon-foreground hover:bg-muted hover:text-foreground",
        subtle:
          "border-0 bg-transparent text-settings-trigger-foreground hover:bg-muted hover:text-foreground",
        plain:
          "border-0 bg-transparent text-inherit hover:bg-muted hover:text-inherit",
        destructive:
          "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90",
        stop: "border-stop-border bg-stop text-stop-foreground hover:border-stop-hover-border hover:bg-stop-hover hover:text-stop-hover-foreground [&_svg]:text-stop-icon",
        link: "gap-[5px] border-0 bg-transparent px-0 py-1 text-[11px] text-link-foreground hover:text-accent-foreground",
      },
      size: {
        default: "gap-3 rounded-[9px] px-4 py-[13px] text-[12px] font-[550]",
        xs: "h-6 gap-1 rounded-md px-2 text-xs",
        sm: "gap-1.5 rounded-[7px] px-3 py-2 text-[11px] font-semibold",
        lg: "h-10 gap-2 rounded-lg px-6 text-sm",
        icon: "size-[29px] rounded-[7px] p-0",
        "icon-xs": "size-6 rounded-md p-0",
        "icon-sm": "size-7 rounded-[7px] p-0",
        "icon-lg": "size-9 rounded-lg p-0",
        copy: "flex min-w-16 gap-[5px] rounded-[5px] px-[9px] py-1.5 text-[10px] font-[550]",
        stop: "min-h-[29px] shrink-0 gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] whitespace-nowrap",
        none: "",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button, buttonVariants }

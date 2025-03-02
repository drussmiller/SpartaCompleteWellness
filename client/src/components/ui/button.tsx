import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-gray-200 text-black hover:bg-gray-300",
        destructive: "bg-gray-200 text-black hover:bg-gray-300",
        outline: "bg-gray-200 text-black hover:bg-gray-300",
        secondary: "bg-gray-200 text-black hover:bg-gray-300",
        ghost: "bg-gray-200 text-black hover:bg-gray-300",
        link: "bg-gray-200 text-black hover:bg-gray-300",
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-10 px-6 py-2",
        lg: "h-10 px-6 py-2",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost";
};

type ButtonLinkProps = ComponentPropsWithoutRef<typeof Link> & {
  variant?: "primary" | "secondary" | "ghost";
};

function classForVariant(variant: ButtonProps["variant"] = "primary", className?: string): string {
  return ["button", `button-${variant}`, className].filter(Boolean).join(" ");
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return <button className={classForVariant(variant, className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ButtonLinkProps) {
  return <Link className={classForVariant(variant, className)} {...props} />;
}

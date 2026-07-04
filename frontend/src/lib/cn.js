/**
 * Tiny classNames joiner — filters falsy values so conditional classes read
 * cleanly (`cn("base", active && "is-active")`). Deliberately dependency-free.
 */
export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}
